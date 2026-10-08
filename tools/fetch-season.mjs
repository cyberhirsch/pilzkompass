// Adds a season profile to species.json: GBIF occurrences per month (Europe; worldwide for
// species with too few European records). Rerun to refresh.
import { readFile, writeFile } from 'node:fs/promises';

const UA = { 'User-Agent': 'boletus-species-list/1.0 (season calendar)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gbif(path, params) {
  const url = `https://api.gbif.org/v1/${path}?` + new URLSearchParams(params);
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    if (r?.ok) { await sleep(300); return r.json(); }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error('GBIF refused: ' + url);
}

async function months(taxonKey, extra) {
  const j = await gbif('occurrence/search', { taxonKey, facet: 'month', limit: 0, 'month.facetLimit': 12, ...extra });
  const m = Array(12).fill(0);
  for (const c of j.facets?.[0]?.counts ?? []) m[Number(c.name) - 1] = c.count;
  return m;
}

const path = new URL('./species.json', import.meta.url);
const list = JSON.parse(await readFile(path, 'utf8'));
for (const s of list) {
  const match = await gbif('species/match', { name: s.sci, kingdom: 'Fungi' });
  if (!match.usageKey || match.matchType === 'NONE') { console.log('NO MATCH', s.sci); s.season = null; continue; }
  const key = match.acceptedUsageKey ?? match.usageKey;
  let m = await months(key, { continent: 'EUROPE' }), region = 'EU';
  if (m.reduce((a, b) => a + b, 0) < 30) { m = await months(key, {}); region = 'world'; }
  s.season = { months: m, region };
  console.log(String(m.reduce((a, b) => a + b, 0)).padStart(6), region.padEnd(5), s.sci, match.matchType === 'EXACT' ? '' : `(${match.matchType} → ${match.scientificName})`);
}
await writeFile(path, '[\n  ' + list.map(s => JSON.stringify(s)).join(',\n  ') + '\n]\n');

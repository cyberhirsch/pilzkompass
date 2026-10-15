// Counts research-grade iNaturalist observations with photos per species,
// split by licence: commercial-friendly (CC0, CC BY, CC BY-SA) vs. all.
// Writes tools/inat-counts.json and prints a table.
import { readFile, writeFile } from 'node:fs/promises';

const UA = { 'User-Agent': 'pilzkompass/1.0 (training data survey)' };
const OPEN = 'cc0,cc-by,cc-by-sa';
// Look-alikes outside species.json (none left: since stage 1 they all have a card).
const LOOKALIKES = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path, params) {
  const url = `https://api.inaturalist.org/v1/${path}?` + new URLSearchParams(params);
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    if (r?.ok) { await sleep(1100); return r.json(); }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('iNaturalist refused: ' + url);
}

async function taxon(name) {
  const j = await get('taxa', { q: name, rank: 'species', per_page: 10 });
  const hit = j.results.find(t => t.name === name)
    ?? j.results.find(t => t.matched_term === name)
    ?? j.results.find(t => t.iconic_taxon_name === 'Fungi');
  return hit ? { id: hit.id, name: hit.name } : null;
}

const count = (taxon_id, license) => get('observations', {
  taxon_id, quality_grade: 'research', photos: true, per_page: 0,
  ...(license ? { photo_license: license } : {}),
}).then(j => j.total_results);

const species = JSON.parse(await readFile(new URL('./species.json', import.meta.url), 'utf8'));
const out = new URL('./inat-counts.json', import.meta.url);
// Counts from the last run are reused; pass --fresh to recount everything.
const old = process.argv.includes('--fresh') ? new Map()
  : new Map(JSON.parse(await readFile(out, 'utf8').catch(() => '[]')).map(r => [r.sci, r]));
const rows = [];
for (const [sci, kind, bolete] of [...species.map(s => [s.sci, 'species', s.kind === 'bolete']), ...LOOKALIKES.map(n => [n, 'lookalike', false])]) {
  const prev = old.get(sci);
  const t = prev?.taxon_id ? { id: prev.taxon_id, name: prev.inat } : await taxon(sci);
  const row = { sci, kind, bolete, inat: t?.name ?? null, taxon_id: t?.id ?? null, open: 0, all: 0 };
  if (prev?.taxon_id) { row.open = prev.open; row.all = prev.all; }
  else if (t) { row.open = await count(t.id, OPEN); row.all = await count(t.id); }
  rows.push(row);
  console.log(String(row.open).padStart(6), String(row.all).padStart(7), sci, t && t.name !== sci ? `(iNat: ${t.name})` : t ? '' : 'NOT FOUND');
}
await writeFile(out, JSON.stringify(rows, null, 1));

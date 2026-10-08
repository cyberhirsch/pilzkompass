// Counts research-grade iNaturalist observations with photos per species,
// split by licence: commercial-friendly (CC0, CC BY, CC BY-SA) vs. all.
// Writes tools/inat-counts.json and prints a table.
import { readFile, writeFile } from 'node:fs/promises';

const UA = { 'User-Agent': 'pilzkompass/1.0 (training data survey)' };
const OPEN = 'cc0,cc-by,cc-by-sa';
const LOOKALIKES = [
  'Paxillus involutus', 'Scleroderma citrinum', 'Scleroderma areolatum', 'Hygrophoropsis aurantiaca',
  'Amanita phalloides', 'Amanita muscaria', 'Amanita pantherina', 'Amanita rubescens',
  'Fistulina hepatica', 'Russula ochroleuca', 'Lactarius deliciosus', 'Cantharellus cibarius',
];
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
const rows = [];
for (const [sci, kind] of [...species.map(s => [s.sci, 'bolete']), ...LOOKALIKES.map(n => [n, 'lookalike'])]) {
  const t = await taxon(sci);
  const row = { sci, kind, inat: t?.name ?? null, taxon_id: t?.id ?? null, open: 0, all: 0 };
  if (t) { row.open = await count(t.id, OPEN); row.all = await count(t.id); }
  rows.push(row);
  console.log(String(row.open).padStart(6), String(row.all).padStart(7), sci, t && t.name !== sci ? `(iNat: ${t.name})` : t ? '' : 'NOT FOUND');
}
await writeFile(new URL('./inat-counts.json', import.meta.url), JSON.stringify(rows, null, 1));

// Links model classes (DF20 names) to our species list. Rerun after editing species.json.
// Adds "site": <our scientific name> to each matching entry of model/classes.json.
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../model/classes.json', import.meta.url);
const classes = JSON.parse(await readFile(file, 'utf8'));
const species = JSON.parse(await readFile(new URL('./species.json', import.meta.url), 'utf8'));

// DF20 uses older names for some species.
const SYNONYMS = {
  'Neoboletus luridiformis': ['Neoboletus erythropus', 'Boletus erythropus', 'Boletus luridiformis'],
  'Imleria badia': ['Boletus badius', 'Xerocomus badius'],
  'Hortiboletus rubellus': ['Xerocomellus rubellus'],
  'Butyriboletus pseudoregius': ['Butyriboletus fuscoroseus', 'Boletus fuscoroseus'],
  'Pseudoboletus parasiticus': ['Xerocomus parasiticus'],
};
const OLD_GENERA = ['Boletus', 'Xerocomus', 'Xerocomellus', 'Leccinum', 'Suillus'];

const bySpecies = new Map(classes.map((c, i) => [c.species, i]));
let linked = 0;
for (const c of classes) delete c.site;
for (const s of species) {
  const epithet = s.sci.split(' ')[1];
  const names = [s.sci, ...(SYNONYMS[s.sci] ?? []), ...OLD_GENERA.map(g => `${g} ${epithet}`)];
  const hit = names.find(n => bySpecies.has(n));
  if (hit) { classes[bySpecies.get(hit)].site = s.sci; linked++; }
}
await writeFile(file, JSON.stringify(classes));
console.log(`linked ${linked} of ${species.length} species`);

// Adds look-alikes, eating quality and the beginner star to species.json.
// Look-alikes are written from field-guide knowledge (unverified) and made symmetric.
// beginner = edible (outside the boletes: without restrictions), tastes good, no poisonous or bitter look-alike, not strictly protected, not rare.
import { readFile, writeFile } from 'node:fs/promises';

const L = {
  'Boletus edulis': 'Boletus reticulatus, Boletus pinophilus, Boletus aereus, Tylopilus felleus',
  'Boletus reticulatus': 'Boletus edulis, Boletus aereus, Tylopilus felleus',
  'Boletus pinophilus': 'Boletus edulis, Tylopilus felleus',
  'Boletus aereus': 'Boletus reticulatus, Boletus edulis',
  'Butyriboletus regius': 'Butyriboletus pseudoregius, Butyriboletus appendiculatus',
  'Butyriboletus appendiculatus': 'Butyriboletus regius, Butyriboletus fechtneri, Butyriboletus subappendiculatus, Caloboletus radicans',
  'Butyriboletus fechtneri': 'Caloboletus radicans, Butyriboletus appendiculatus',
  'Butyriboletus pseudoregius': 'Butyriboletus regius, Rubroboletus legaliae',
  'Butyriboletus subappendiculatus': 'Butyriboletus appendiculatus, Caloboletus calopus',
  'Caloboletus calopus': 'Caloboletus radicans, Suillellus luridus, Butyriboletus appendiculatus',
  'Caloboletus radicans': 'Butyriboletus fechtneri, Butyriboletus appendiculatus, Rubroboletus satanas',
  'Caloboletus kluzakii': 'Caloboletus radicans, Butyriboletus regius',
  'Rubroboletus satanas': 'Caloboletus radicans, Rubroboletus legaliae, Rubroboletus rhodoxanthus, Suillellus luridus, Neoboletus luridiformis',
  'Rubroboletus legaliae': 'Rubroboletus satanas, Rubroboletus rhodoxanthus, Butyriboletus pseudoregius',
  'Rubroboletus rhodoxanthus': 'Rubroboletus legaliae, Rubroboletus satanas, Imperator rhodopurpureus',
  'Rubroboletus rubrosanguineus': 'Rubroboletus rhodoxanthus, Neoboletus luridiformis',
  'Rubroboletus lupinus': 'Rubroboletus legaliae, Suillellus queletii, Neoboletus luridiformis',
  'Rubroboletus pulcherrimus': 'Rubroboletus satanas',
  'Rubroboletus dupainii': 'Neoboletus luridiformis, Suillellus queletii',
  'Rubroboletus pulchrotinctus': 'Rubroboletus legaliae, Rubroboletus rhodoxanthus',
  'Rubroboletus demonensis': 'Rubroboletus satanas',
  'Imperator rhodopurpureus': 'Imperator torosus, Neoboletus luridiformis, Rubroboletus rubrosanguineus',
  'Imperator torosus': 'Imperator rhodopurpureus, Neoboletus luridiformis',
  'Imperator luteocupreus': 'Imperator rhodopurpureus',
  'Neoboletus luridiformis': 'Suillellus luridus, Suillellus queletii, Rubroboletus satanas, Rubroboletus lupinus, Imperator torosus',
  'Neoboletus junquilleus': 'Neoboletus luridiformis, Butyriboletus appendiculatus, Caloboletus radicans',
  'Neoboletus venenatus': 'Neoboletus luridiformis',
  'Suillellus luridus': 'Neoboletus luridiformis, Rubroboletus satanas, Caloboletus calopus, Suillellus mendax',
  'Suillellus queletii': 'Neoboletus luridiformis, Rubroboletus lupinus, Rubroboletus dupainii',
  'Suillellus mendax': 'Suillellus luridus',
  'Suillellus comptus': 'Suillellus luridus',
  'Cyanoboletus pulverulentus': 'Imleria badia, Xerocomus ferrugineus',
  'Hemileccinum impolitum': 'Hemileccinum depilatum, Butyriboletus fechtneri, Leccinellum crocipodium',
  'Hemileccinum depilatum': 'Hemileccinum impolitum',
  'Imleria badia': 'Xerocomus ferrugineus, Cyanoboletus pulverulentus, Chalciporus piperatus, Tylopilus felleus',
  'Xerocomus subtomentosus': 'Xerocomus ferrugineus, Xerocomellus chrysenteron, Chalciporus piperatus',
  'Xerocomus ferrugineus': 'Xerocomus subtomentosus, Imleria badia, Chalciporus piperatus',
  'Xerocomus chrysonemus': 'Xerocomus subtomentosus',
  'Xerocomus silwoodensis': 'Xerocomus subtomentosus',
  'Xerocomellus chrysenteron': 'Xerocomellus pruinatus, Xerocomellus porosporus, Xerocomellus cisalpinus, Hortiboletus rubellus',
  'Xerocomellus pruinatus': 'Xerocomellus chrysenteron',
  'Xerocomellus porosporus': 'Xerocomellus chrysenteron',
  'Xerocomellus cisalpinus': 'Xerocomellus chrysenteron',
  'Xerocomellus ripariellus': 'Hortiboletus rubellus, Xerocomellus chrysenteron',
  'Xerocomellus redeuilhii': 'Xerocomellus chrysenteron',
  'Xerocomellus marekii': 'Xerocomellus chrysenteron, Xerocomellus pruinatus',
  'Hortiboletus rubellus': 'Hortiboletus engelii, Xerocomellus chrysenteron',
  'Hortiboletus engelii': 'Hortiboletus rubellus',
  'Rheubarbariboletus armeniacus': 'Hortiboletus rubellus, Xerocomellus chrysenteron',
  'Aureoboletus gentilis': 'Chalciporus piperatus',
  'Aureoboletus moravicus': 'Xerocomus subtomentosus',
  'Aureoboletus projectellus': 'Imleria badia',
  'Chalciporus piperatus': 'Imleria badia, Xerocomus subtomentosus, Chalciporus amarellus',
  'Chalciporus amarellus': 'Chalciporus piperatus, Chalciporus rubinus',
  'Chalciporus rubinus': 'Chalciporus amarellus',
  'Tylopilus felleus': 'Boletus edulis, Boletus reticulatus, Boletus pinophilus, Imleria badia, Leccinum scabrum, Porphyrellus porphyrosporus',
  'Porphyrellus porphyrosporus': 'Tylopilus felleus, Imleria badia',
  'Strobilomyces strobilaceus': 'Porphyrellus porphyrosporus',
  'Leccinum scabrum': 'Tylopilus felleus, Leccinum holopus, Leccinum variicolor, Leccinum melaneum, Leccinum cyaneobasileucum, Leccinum schistophilum, Leccinellum pseudoscabrum',
  'Leccinum versipelle': 'Leccinum aurantiacum, Leccinum vulpinum, Leccinum albostipitatum, Leccinum piceinum, Leccinum quercinum',
  'Leccinum aurantiacum': 'Leccinum versipelle, Leccinum albostipitatum, Leccinum quercinum, Leccinum vulpinum',
  'Leccinum vulpinum': 'Leccinum versipelle, Leccinum piceinum',
  'Leccinum duriusculum': 'Leccinum scabrum, Leccinellum pseudoscabrum, Tylopilus felleus',
  'Leccinum variicolor': 'Leccinum scabrum, Leccinum holopus, Tylopilus felleus',
  'Leccinum holopus': 'Leccinum scabrum, Leccinum variicolor, Tylopilus felleus',
  'Leccinum piceinum': 'Leccinum vulpinum, Leccinum aurantiacum',
  'Leccinum quercinum': 'Leccinum aurantiacum',
  'Leccinum albostipitatum': 'Leccinum aurantiacum, Leccinum versipelle',
  'Leccinum melaneum': 'Leccinum scabrum, Tylopilus felleus',
  'Leccinum cyaneobasileucum': 'Leccinum scabrum, Tylopilus felleus',
  'Leccinum schistophilum': 'Leccinum scabrum, Tylopilus felleus',
  'Leccinellum pseudoscabrum': 'Leccinum scabrum, Leccinum duriusculum, Tylopilus felleus',
  'Leccinellum crocipodium': 'Hemileccinum impolitum',
  'Leccinellum lepidum': 'Leccinellum crocipodium',
  'Leccinellum corsicum': 'Leccinellum lepidum',
  'Gyroporus castaneus': 'Gyroporus cyanescens, Gyroporus ammophilus',
  'Gyroporus cyanescens': 'Gyroporus castaneus',
  'Gyroporus ammophilus': 'Gyroporus castaneus',
  'Suillus luteus': 'Suillus granulatus, Suillus collinitus, Suillus grevillei, Suillus bellinii',
  'Suillus grevillei': 'Suillus tridentinus, Suillus viscidus, Suillus luteus',
  'Suillus granulatus': 'Suillus luteus, Suillus collinitus, Suillus placidus, Suillus bellinii',
  'Suillus bovinus': 'Suillus variegatus, Suillus granulatus',
  'Suillus variegatus': 'Suillus bovinus',
  'Suillus viscidus': 'Suillus grevillei',
  'Suillus collinitus': 'Suillus granulatus, Suillus luteus',
  'Suillus placidus': 'Suillus granulatus',
  'Suillus plorans': 'Suillus sibiricus, Suillus placidus',
  'Suillus sibiricus': 'Suillus plorans, Suillus grevillei',
  'Suillus cavipes': 'Suillus grevillei, Suillus tridentinus',
  'Suillus tridentinus': 'Suillus grevillei',
  'Suillus flavidus': 'Suillus grevillei, Suillus luteus',
  'Suillus lakei': 'Suillus cavipes',
  'Suillus bellinii': 'Suillus granulatus',
  'Suillus mediterraneensis': 'Suillus granulatus, Suillus collinitus',
  'Lanmaoa fragrans': 'Imleria badia, Cyanoboletus pulverulentus',
  'Buchwaldoboletus lignicola': 'Buchwaldoboletus hemichrysus',
  'Buchwaldoboletus hemichrysus': 'Buchwaldoboletus lignicola',
  // Beyond the boletes (stage 1).
  'Cantharellus cibarius': 'Hygrophoropsis aurantiaca, Omphalotus olearius, Craterellus tubaeformis',
  'Craterellus tubaeformis': 'Cortinarius rubellus, Cortinarius orellanus',
  'Craterellus cornucopioides': 'Craterellus tubaeformis',
  'Macrolepiota procera': 'Chlorophyllum rhacodes, Chlorophyllum brunneum, Lepiota brunneoincarnata, Lepiota cristata, Amanita pantherina',
  'Chlorophyllum rhacodes': 'Chlorophyllum brunneum, Lepiota brunneoincarnata, Amanita pantherina',
  'Agaricus campestris': 'Agaricus arvensis, Amanita phalloides, Amanita virosa, Agaricus xanthodermus, Entoloma sinuatum, Lepiota brunneoincarnata',
  'Agaricus arvensis': 'Amanita virosa, Amanita phalloides, Agaricus xanthodermus',
  'Amanita rubescens': 'Amanita pantherina, Amanita muscaria',
  'Amanita citrina': 'Amanita phalloides, Amanita virosa',
  'Amanita muscaria': 'Amanita pantherina',
  'Lactarius deliciosus': 'Lactarius deterrimus, Lactarius torminosus',
  'Lactarius deterrimus': 'Lactarius torminosus',
  'Russula cyanoxantha': 'Amanita phalloides, Russula vesca',
  'Russula vesca': 'Amanita phalloides, Russula emetica',
  'Russula ochroleuca': 'Amanita citrina, Russula vesca',
  'Armillaria mellea': 'Armillaria ostoyae, Galerina marginata, Hypholoma fasciculare',
  'Armillaria ostoyae': 'Galerina marginata, Hypholoma fasciculare',
  'Kuehneromyces mutabilis': 'Galerina marginata, Hypholoma fasciculare, Armillaria mellea',
  'Coprinus comatus': 'Coprinopsis atramentaria',
  'Lepista nuda': 'Clitocybe nebularis',
  'Calocybe gambosa': 'Inosperma erubescens, Entoloma sinuatum, Clitocybe rivulosa',
  'Marasmius oreades': 'Clitocybe rivulosa',
  'Morchella esculenta': 'Gyromitra esculenta',
  'Calvatia gigantea': 'Scleroderma citrinum, Amanita phalloides',
  'Lycoperdon perlatum': 'Scleroderma citrinum, Scleroderma areolatum, Amanita phalloides, Calvatia gigantea',
  'Scleroderma citrinum': 'Scleroderma areolatum',
  'Clitocybe nebularis': 'Entoloma sinuatum',
  'Tricholoma equestre': 'Russula ochroleuca',
  'Laetiporus sulphureus': 'Fistulina hepatica',
  'Auricularia auricula-judae': 'Craterellus cornucopioides',
  // Bolete look-alikes that are not boletes (formerly external entries).
  'Phylloporus pelletieri': 'Xerocomus subtomentosus, Paxillus involutus',
  'Gyrodon lividus': 'Xerocomus subtomentosus, Paxillus involutus',
  'Pseudoboletus parasiticus': 'Xerocomus subtomentosus, Xerocomus ferrugineus, Scleroderma citrinum',
};

// Dangerous look-alikes without a card of their own (none left: they all have one now).
const EXT = {};

const Q = {
  excellent: 'Boletus edulis, Boletus reticulatus, Boletus pinophilus, Boletus aereus, Butyriboletus regius, Butyriboletus appendiculatus, Butyriboletus pseudoregius, Butyriboletus subappendiculatus, Butyriboletus fechtneri, Neoboletus luridiformis, Imleria badia, Leccinum versipelle, Leccinum aurantiacum, Leccinum vulpinum, Leccinum quercinum, Leccinum albostipitatum, Leccinum piceinum, Cantharellus cibarius, Craterellus cornucopioides, Macrolepiota procera, Lactarius deliciosus, Calocybe gambosa, Morchella esculenta, Sparassis crispa, Kuehneromyces mutabilis',
  good: 'Suillellus queletii, Suillellus luridus, Suillellus mendax, Neoboletus junquilleus, Suillellus comptus, Cyanoboletus pulverulentus, Hemileccinum impolitum, Hemileccinum depilatum, Gyroporus castaneus, Gyroporus cyanescens, Leccinum scabrum, Leccinum duriusculum, Leccinum variicolor, Leccinum melaneum, Leccinum cyaneobasileucum, Leccinum schistophilum, Leccinellum pseudoscabrum, Leccinellum crocipodium, Leccinellum lepidum, Leccinellum corsicum, Suillus luteus, Suillus grevillei, Suillus granulatus, Suillus collinitus, Suillus cavipes, Suillus tridentinus, Suillus lakei, Suillus bellinii, Suillus mediterraneensis, Lanmaoa fragrans, Aureoboletus gentilis, Aureoboletus moravicus, Xerocomus chrysonemus, Xerocomus silwoodensis, Phylloporus pelletieri, Craterellus tubaeformis, Hydnum repandum, Chlorophyllum rhacodes, Agaricus campestris, Agaricus arvensis, Amanita rubescens, Lactarius deterrimus, Russula cyanoxantha, Russula vesca, Armillaria mellea, Armillaria ostoyae, Pleurotus ostreatus, Coprinus comatus, Lepista nuda, Marasmius oreades, Laetiporus sulphureus, Calvatia gigantea, Fistulina hepatica',
  mediocre: 'Xerocomellus pruinatus, Hortiboletus engelii, Rheubarbariboletus armeniacus, Xerocomellus chrysenteron, Xerocomellus porosporus, Xerocomellus cisalpinus, Xerocomellus redeuilhii, Xerocomellus marekii, Xerocomellus ripariellus, Hortiboletus rubellus, Xerocomus subtomentosus, Xerocomus ferrugineus, Suillus bovinus, Suillus variegatus, Suillus viscidus, Suillus placidus, Suillus plorans, Suillus sibiricus, Suillus flavidus, Leccinum holopus, Gyrodon lividus, Strobilomyces strobilaceus, Aureoboletus projectellus, Lycoperdon perlatum, Auricularia auricula-judae',
};

const path = new URL('./species.json', import.meta.url);
const list = JSON.parse(await readFile(path, 'utf8'));
const by = new Map(list.map(s => [s.sci, s]));
const split = v => v.split(',').map(x => x.trim()).filter(Boolean);

for (const s of list) s.lookalikes = [];
for (const [sci, v] of Object.entries(L)) {
  if (!by.has(sci)) throw new Error('unknown ' + sci);
  for (const other of split(v)) {
    if (!by.has(other)) throw new Error(`unknown look-alike ${other} (of ${sci})`);
    for (const [a, b] of [[sci, other], [other, sci]])
      if (!by.get(a).lookalikes.includes(b)) by.get(a).lookalikes.push(b);
  }
}
const quality = {};
for (const [q, v] of Object.entries(Q)) for (const sci of split(v)) {
  if (!by.has(sci)) throw new Error('unknown ' + sci);
  quality[sci] = q;
}

const finds = s => s.season ? s.season.months.reduce((a, b) => a + b, 0) : 0;
for (const s of list) {
  s.quality = quality[s.sci] ?? null;
  const edible = s.status === 'edible' || s.status === 'caution';
  s.extLookalikes = (EXT[s.sci] ?? []).map(([sci, de, en, status]) => ({ sci, de, en, status }));
  const dangerousTwin = s.lookalikes.some(o => ['poisonous', 'bitter'].includes(by.get(o).status))
    || s.extLookalikes.some(x => x.status === 'poisonous');
  s.beginner = edible && ['excellent', 'good'].includes(s.quality) && !dangerousTwin
    && s.protection !== 'strict' && finds(s) >= 500
    // Beyond the boletes only plain edibles: no 'cook thoroughly' or 'young only' species.
    && (s.kind === 'bolete' || s.status === 'edible');
}
const missing = list.filter(s => !s.lookalikes.length).map(s => s.sci);
if (missing.length) console.log('no look-alikes:', missing.join(', '));
await writeFile(path, '[\n  ' + list.map(s => JSON.stringify(s)).join(',\n  ') + '\n]\n');
console.log('beginner ⭐:', list.filter(s => s.beginner).map(s => `${s.sci} (${s.de})`).join(', '));

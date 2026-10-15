// Builds ../data.js: species list + a Wikimedia photo gallery per species.
// API responses are cached in tools/.cache.json, so reruns are fast.
import { readFile, writeFile, rename } from 'node:fs/promises';

const UA = { 'User-Agent': 'pilzkompass/1.0 (static site builder)' };
const MAX_PHOTOS = 8;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const species = JSON.parse(await readFile(new URL('./species.json', import.meta.url), 'utf8'));
const cacheFile = new URL('./.cache.json', import.meta.url);
let cache = {};
try { cache = JSON.parse(await readFile(cacheFile, 'utf8')); } catch { /* missing or truncated: start fresh */ }
// Write to a temp file first so an interrupted run can't leave a truncated cache.
async function saveCache() {
  const tmp = new URL('./.cache.tmp.json', import.meta.url);
  await writeFile(tmp, JSON.stringify(cache));
  await rename(tmp, cacheFile);
}

// POST, so long title lists don't hit URL length limits.
async function api(host, params) {
  const body = new URLSearchParams({ format: 'json', maxlag: 5, ...params }).toString();
  const key = host + '?' + body;
  if (cache[key]) return cache[key];
  let last = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://${host}/w/api.php`, {
      method: 'POST', body, headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(e => ({ ok: false, status: e.message, text: async () => '' }));
    const text = await r.text();
    if (r.ok && text.startsWith('{') && !text.includes('"maxlag"')) {
      await sleep(800);
      return (cache[key] = JSON.parse(text));
    }
    last = `${r.status} ${text.slice(0, 120)}`;
    await sleep(4000 * (attempt + 1));
  }
  throw new Error(`API kept refusing ${host}: ${last}`);
}
const commons = params => api('commons.wikimedia.org', { action: 'query', ...params });

// --- Lead image from Wikipedia (batched, redirect-aware) ---
async function leadImages(lang, titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const j = await api(`${lang}.wikipedia.org`, {
      action: 'query', titles: titles.slice(i, i + 40).join('|'), redirects: 1,
      prop: 'pageimages', piprop: 'name', pilimit: 50,
    });
    const back = {};
    for (const n of j.query?.normalized ?? []) back[n.to] = n.from;
    for (const r of j.query?.redirects ?? []) back[r.to] = back[r.from] ?? r.from;
    for (const p of Object.values(j.query?.pages ?? {}))
      if (p.pageimage) out[back[p.title] ?? p.title] = p.pageimage.replace(/_/g, ' ');
  }
  return out;
}

// --- Names a species has been filed under on Commons ---
const OLD_GENERA = ['Boletus', 'Xerocomus', 'Leccinum', 'Suillus'];
const EXTRA_NAMES = {
  'Imleria badia': ['Boletus badius', 'Xerocomus badius'],
  'Neoboletus luridiformis': ['Boletus erythropus', 'Boletus luridiformis', 'Neoboletus erythropus'],
  'Butyriboletus pseudoregius': ['Boletus fuscoroseus'],
  'Strobilomyces strobilaceus': ['Strobilomyces floccopus'],
  'Hortiboletus engelii': ['Xerocomellus engelii', 'Boletus communis'],
  'Rheubarbariboletus armeniacus': ['Xerocomellus armeniacus'],
  'Leccinum versipelle': ['Leccinum testaceoscabrum'],
  'Neoboletus venenatus': ['Boletus venenatus', 'Sutorius venenatus'],
  'Porphyrellus porphyrosporus': ['Tylopilus porphyrosporus'],
  'Suillus sibiricus': ['Suillus sibiricus subsp. helveticus'],
  'Lepista nuda': ['Clitocybe nuda'],
  'Clitocybe nebularis': ['Lepista nebularis'],
  'Inosperma erubescens': ['Inocybe erubescens', 'Inocybe patouillardii'],
  'Kuehneromyces mutabilis': ['Pholiota mutabilis'],
  'Chlorophyllum rhacodes': ['Macrolepiota rhacodes', 'Chlorophyllum rachodes'],
  'Calvatia gigantea': ['Langermannia gigantea'],
  'Craterellus tubaeformis': ['Cantharellus tubaeformis'],
};
function namesFor(sci, kind) {
  const epithet = sci.split(' ')[1];
  const old = kind === 'bolete' ? OLD_GENERA.map(g => `${g} ${epithet}`) : [];
  return [...new Set([sci, ...old, ...(EXTRA_NAMES[sci] ?? [])])];
}

async function categoryFiles(cat, depth = 1) {
  const files = [];
  const j = await commons({ list: 'categorymembers', cmtitle: `Category:${cat}`, cmtype: 'file|subcat', cmlimit: 500 });
  for (const m of j.query?.categorymembers ?? []) {
    if (m.ns === 6) files.push({ title: m.title, hint: cat });
    else if (m.ns === 14 && depth > 0) {
      const sub = m.title.replace(/^Category:/, '');
      // Only descend into subcategories about this species (e.g. "Boletus edulis (cross sections)").
      const epithet = cat.split(' ')[1]?.toLowerCase();
      if (epithet && sub.toLowerCase().includes(epithet) && !/microscop|spore|stamp|illustrat|drawing|herbar|food|cuisine|market/i.test(sub))
        for (const f of await categoryFiles(sub, depth - 1)) files.push({ ...f, hint: sub });
    }
  }
  return files;
}

async function fileInfo(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 25) {
    const j = await commons({
      titles: titles.slice(i, i + 25).join('|'), prop: 'imageinfo|categories', cllimit: 500,
      iiprop: 'url|mime|size|extmetadata', iiurlwidth: 1280,
      iiextmetadatafilter: 'Artist|LicenseShortName|ImageDescription',
    });
    for (const p of Object.values(j.query?.pages ?? {})) if (p.imageinfo) out[p.title] = p;
  }
  return out;
}

const strip = html => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// Author for the credit line: the Commons "Artist" field cleaned of boilerplate, at most 120 characters.
function cleanArtist(html) {
  let a = strip(html).replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(');
  let m;
  if ((m = a.match(/created by user\s*(.*?)\s*(?:\(([^)]*)\))?\s*at Mushroom Observer/i))) a = `${m[1] || m[2]} (Mushroom Observer)`;
  else if ((m = a.match(/No machine-readable author provided\.\s*(.+?)\s+assumed/i))) a = m[1];
  else if ((m = a.match(/original uploader was\s+(.+?)\s+at\s+(\w+) Wikipedia/i))) a = `${m[1]} (Wikipedia ${m[2]})`;
  else if ((m = a.match(/work of photographer\s+([^,.]+)/i))) a = m[1];
  else if ((m = a.match(/^Photo by\s+([^.]+)/i))) a = m[1];
  a = a.replace(/^(File:)?[^:]*?\.(jpe?g|png|tiff?)\s*:\s*/i, '')  // "Original.jpg : Author"
    .replace(/\s*\(\s*talk\s*\)?\s*$/i, '').replace(/\s*\(\s*talk\s*\)/gi, '')
    .replace(/\s*derivative work:\s*/i, ' · Bearbeitung: ').replace(/[\s·:]+$/, '').trim();
  return a.length > 120 ? a.slice(0, 119).trimEnd() + '…' : a;
}
const REJECT = /\bspores?\b|sporen|spore.?print|micro|mikro|cystid|basidi|\bhyph(ae|en)?\b|stamp|briefmarke|illustrat|drawing|zeichnung|aquarell|painting|gemälde|\bplate\b|tafel|herbar|exsicc|dried|getrocknet|\bmap\b|karte|distribution|recipe|soup|suppe|market|markt|basket|korb|bucket|eimer|pizza|risotto|sauce|cooked|fried|gebraten|pfanne|dish|kitchen|küche|harvest|ernte|\bsale\b|verkauf|frozen|chemical|reagent|\bkoh\b|\bnh3\b|mycel|culture|petri|logo/i;
// Checked against the file name only: descriptions often mention camera models etc.
const REJECT_TITLE = /\bmodel\b|modell|\bwax\b|wachs|replica|sculpt|figurine|\btoy\b|spielzeug|museum|mhnt/i;
// Files filed under a species category that show another fungus.
const BAD_FILES = new Set([
  'Calocera viscosa - Klebringer Hörnling - Yellow stagshorn fungi - 02.jpg',
]);
const STAGES = [
  ['cut', /cross.?section|section|\bcut\b|sliced|halved|schnitt|halbiert|aufgeschnitten|flesh|fleisch|bluing|blueing|blauend|verfärb|discolou?r|inside|innen/i],
  ['pores', /pores?\b|poren|underside|unterseite|hymeni|tubes|röhren|from below|von unten/i],
  ['young', /young|juvenil|jung|primordi|\bbaby|button|emerging/i],
  ['old', /\bold\b|aged|overmature|senescen|\balt\b|älter|alte[rs]?\b|decay|rotting|verrott/i],
];
const stageOf = text => STAGES.find(([, re]) => re.test(text))?.[0] ?? null;

async function gallery(s, lead, extra = []) {
  const seen = new Map(extra.map(t => [t, { title: t, hint: '' }]));
  for (const name of namesFor(s.sci, s.kind))
    for (const f of await categoryFiles(name)) if (!seen.has(f.title)) seen.set(f.title, f);
  if (lead && !seen.has('File:' + lead)) seen.set('File:' + lead, { title: 'File:' + lead, hint: '' });

  const info = await fileInfo([...seen.keys()]);
  const items = [];
  for (const [title, f] of seen) {
    const p = info[title];
    const ii = p?.imageinfo?.[0];
    if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime) || ii.width < 500) continue;
    const meta = ii.extmetadata ?? {};
    const desc = strip(meta.ImageDescription?.value);
    const text = `${title} ${desc} ${f.hint}`;
    if (REJECT.test(text) || REJECT_TITLE.test(title) || BAD_FILES.has(title.replace(/^File:/, ''))) continue;
    const cats = (p.categories ?? []).map(c => c.title).join(' ');
    items.push({
      file: title.replace(/^File:/, ''),
      src: ii.thumburl ?? ii.url,
      thumb: (ii.thumburl ?? ii.url).replace(/\/1280px-/, '/330px-'),
      artist: cleanArtist(meta.Artist?.value),
      license: strip(meta.LicenseShortName?.value),
      stage: stageOf(text),
      score: (title === 'File:' + lead ? 100 : 0) + (/Featured pictures|Quality images|Valued images/.test(cats) ? 10 : 0) + Math.min(ii.width / 1000, 4),
    });
  }
  items.sort((a, b) => b.score - a.score);

  // Lead first, then one of each stage, then the best of the rest.
  const picked = items.slice(0, 1);
  for (const [stage] of STAGES) {
    const hit = items.find(i => i.stage === stage && !picked.includes(i));
    if (hit) picked.push(hit);
  }
  for (const i of items) if (picked.length < MAX_PHOTOS && !picked.includes(i)) picked.push(i);
  return picked.map(({ score, ...rest }) => rest);
}

let leads = await leadImages('en', species.map(s => s.sci));
const deLeads = await leadImages('de', species.filter(s => !leads[s.sci]).map(s => s.sci));
leads = { ...deLeads, ...leads };

// Last resort for species without a Commons category: a file search.
async function searchFiles(s) {
  const query = s.commonsQuery ?? s.sci;
  const j = await commons({ list: 'search', srsearch: `${query} filetype:bitmap`, srnamespace: 6, srlimit: 20 });
  const key = (s.commonsQuery ?? s.sci.split(' ')[1]).toLowerCase();
  return (j.query?.search ?? []).map(r => r.title).filter(t => t.toLowerCase().includes(key));
}

for (const s of species) {
  s.photos = await gallery(s, leads[s.sci]);
  if (!s.photos.length) s.photos = await gallery(s, leads[s.sci], await searchFiles(s));
  const stages = [...new Set(s.photos.map(p => p.stage).filter(Boolean))].join(',');
  console.log(String(s.photos.length).padStart(2), s.sci.padEnd(32), stages);
  await saveCache();
}

await writeFile(new URL('../data.js', import.meta.url),
  '// Generated by tools/fetch-images.mjs\nwindow.BOLETES = ' + JSON.stringify(species, null, 1) + ';\n');

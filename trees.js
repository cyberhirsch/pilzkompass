// Shared access to the 1 km tree grid (maps/trees.bin, from the Thünen tree species map).
window.TreeGrid = (() => {
  // Our host-tree codes → map classes, with a weight where the map class is only a broad group.
  const HOST = {
    spruce: ['spruce', 1], pine: ['pine', 1], larch: ['larch', 1], fir: ['fir', 1], douglas: ['douglas', 1],
    oak: ['oak', 1], beech: ['beech', 1], birch: ['birch', 1], alder: ['alder', 1],
    hornbeam: ['odh', .5], lime: ['odh', .5], chestnut: ['odh', .5], hazel: ['odh', .3],
    aspen: ['odl', .5], willow: ['odl', .5], stonepine: ['pine', .2],
  };
  // Not native to Germany (Mediterranean, North America, East Asia): never suggested here.
  const NOT_IN_DE = new Set(['Rubroboletus pulcherrimus', 'Neoboletus venenatus', 'Rubroboletus demonensis',
    'Rubroboletus pulchrotinctus', 'Suillellus comptus', 'Leccinellum lepidum', 'Leccinellum corsicum',
    'Gyroporus ammophilus', 'Suillus bellinii', 'Suillus mediterraneensis', 'Aureoboletus projectellus']);
  const R = 6378137;
  const api = { HOST, NOT_IN_DE, meta: null, grid: null };
  let loading;

  api.load = (base = 'maps/') => loading ??= Promise.all([
    fetch(base + 'trees.json').then(r => r.json()),
    fetch(base + 'trees.bin').then(r => r.arrayBuffer()),
  ]).then(([m, buf]) => { api.meta = m; api.grid = new Uint8Array(buf); return api; });

  // Weights over map classes for one bolete; several codes may hit the same class → keep the max.
  api.weights = s => {
    const w = new Float32Array(api.meta.classes.length);
    for (const code of s.trees ?? []) {
      const h = HOST[code];
      if (h) { const i = api.meta.classes.indexOf(h[0]); w[i] = Math.max(w[i], h[1]); }
    }
    return w;
  };

  // Percent of the cell area covered by weighted host trees.
  api.cellScore = (w, idx) => {
    const n = api.meta.width * api.meta.height;
    let v = 0;
    for (let c = 0; c < w.length; c++) if (w[c]) v += w[c] * api.grid[c * n + idx];
    return v;
  };

  // Grid cell (row, col) for a lat/lon, or null outside Germany's grid.
  api.cell = (lat, lon) => {
    const x = R * lon * Math.PI / 180, y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    const [l, , r, t] = api.meta.bounds, res = (r - l) / api.meta.width;
    const col = Math.floor((x - l) / res), row = Math.floor((t - y) / res);
    return col < 0 || row < 0 || col >= api.meta.width || row >= api.meta.height ? null : { row, col };
  };

  // Mean over a (2r+1)² block of cells around a point; fn(idx) → value.
  api.around = (lat, lon, fn, r = 2) => {
    const c = api.cell(lat, lon);
    if (!c) return null;
    let sum = 0, n = 0;
    for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
      const row = c.row + dr, col = c.col + dc;
      if (row < 0 || col < 0 || row >= api.meta.height || col >= api.meta.width) continue;
      sum += fn(row * api.meta.width + col); n++;
    }
    return sum / n;
  };

  api.forest = idx => {
    const n = api.meta.width * api.meta.height;
    let v = 0;
    for (let c = 0; c < api.meta.classes.length; c++) v += api.grid[c * n + idx];
    return v;
  };

  return api;
})();

// Bottom tab bar shared by all pages: Heute · Arten · Bestimmen · Karte.
// Include at the end of <body>. Labels follow <html lang>, which every page sets on language change.
(() => {
  const icon = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TABS = [
    { id: 'today', href: 'index.html#heute', de: 'Heute', en: 'Today',
      svg: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>') },
    { id: 'species', href: 'index.html#arten', de: 'Arten', en: 'Species',
      svg: icon('<path d="M4 18c0-6 3.6-10 8-10s8 4 8 10Z"/><path d="M10 18v3h4v-3"/><path d="M9 12h.01M13 10h.01M15 13h.01"/>') },
    { id: 'identify', href: 'bestimmen.html', de: 'Bestimmen', en: 'Identify',
      svg: icon('<path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>') },
    { id: 'map', href: 'karte.html', de: 'Karte', en: 'Map',
      svg: icon('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z"/><path d="M9 4v14M15 6v14"/>') },
  ];

  const css = document.createElement('style');
  css.textContent = `
    .tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: flex; justify-content: center;
      background: rgba(20, 17, 13, .96); backdrop-filter: blur(8px); border-top: 1px solid #3a3127;
      padding-bottom: env(safe-area-inset-bottom); }
    .tabbar a { flex: 1; max-width: 160px; display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 8px 4px 7px; color: #a99a85; text-decoration: none; font: 600 11px Inter, system-ui, sans-serif; }
    .tabbar a[aria-current="page"] { color: #efe6d8; }
    .tabbar a[aria-current="page"] svg { color: #e0a83a; }
    body { padding-bottom: calc(60px + env(safe-area-inset-bottom)); }`;
  document.head.append(css);

  const bar = document.createElement('nav');
  bar.className = 'tabbar';
  document.body.append(bar);

  function current() {
    const page = location.pathname.split('/').pop() || 'index.html';
    if (page.startsWith('bestimmen')) return 'identify';
    if (page.startsWith('karte')) return 'map';
    if (page.startsWith('index') || page === '') return document.body.dataset.view === 'species' ? 'species' : 'today';
    return null;
  }

  function render() {
    const de = (document.documentElement.lang || 'de').startsWith('de');
    const cur = current();
    bar.setAttribute('aria-label', de ? 'Hauptnavigation' : 'Main navigation');
    bar.innerHTML = TABS.map(t => `<a href="${t.href}"${t.id === cur ? ' aria-current="page"' : ''}>${t.svg}<span>${de ? t.de : t.en}</span></a>`).join('');
  }

  render();
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
})();

// Shared helpers for location, mushroom weather and season (index.html, karte.html).
window.Pilzwetter = (() => {
  const round1 = v => Math.round(v * 10) / 10;

  // Rounded to ~10 km before anything leaves the device.
  async function load(lat, lon) {
    lat = round1(lat); lon = round1(lon);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&past_days=14&forecast_days=1&timezone=auto';
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather ' + r.status);
    const d = (await r.json()).daily;
    return { lat, lon, days: d.time.map((day, i) => ({
      day, rain: d.precipitation_sum[i] ?? 0, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i] })) };
  }

  // Rule of thumb for boletes: enough rain in the last two weeks, mild temperatures, no frost.
  function assess(days) {
    const last = n => days.slice(-n);
    const rain14 = days.slice(-14).reduce((a, d) => a + d.rain, 0);
    const rain3 = last(3).reduce((a, d) => a + d.rain, 0);
    const tmean7 = last(7).reduce((a, d) => a + (d.tmax + d.tmin) / 2, 0) / 7;
    const frost = last(7).filter(d => d.tmin < 0).length;
    let level, why = [];
    if (frost >= 2 || tmean7 < 5) { level = 'poor'; why.push(frost >= 2 ? 'frost' : 'cold'); }
    else if (rain14 < 15) { level = 'poor'; why.push('dry'); }
    else if (rain14 >= 35 && tmean7 >= 10 && tmean7 <= 22) level = 'good';
    else {
      level = 'medium';
      if (rain14 < 35) why.push('littleRain');
      if (tmean7 < 10) why.push('cool');
      if (tmean7 > 22) why.push('hot');
    }
    return { rain14, rain3, tmean7, frost, level, why };
  }

  const finds = s => s.season ? s.season.months.reduce((a, b) => a + b, 0) : 0;
  // This month's finds relative to the peak month (0..1); 0 when there is too little data.
  function seasonShare(s, month = new Date().getMonth()) {
    if (finds(s) < 20) return 0;
    return s.season.months[month] / Math.max(...s.season.months);
  }
  const inSeason = (s, month) => seasonShare(s, month) >= 0.3;

  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), reject,
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
    });
  }

  async function geocode(name, lang) {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=${lang}&format=json`)
      .then(r => r.json());
    const p = g.results?.[0];
    return p ? { lat: p.latitude, lon: p.longitude, name: [p.name, p.admin1, p.country_code].filter(Boolean).join(', ') } : null;
  }

  return { load, assess, finds, seasonShare, inSeason, locate, geocode };
})();

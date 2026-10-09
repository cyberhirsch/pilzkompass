// Shared helpers for location, mushroom weather and season (index.html, karte.html).
window.Pilzwetter = (() => {
  const round1 = v => Math.round(v * 10) / 10;

  // Rounded to ~10 km before anything leaves the device. 14 past days, today and a 7-day forecast;
  // days[today] is today, later entries are forecast.
  const FORECAST = 7;
  async function load(lat, lon) {
    lat = round1(lat); lon = round1(lon);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&past_days=14&forecast_days=${FORECAST + 1}&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather ' + r.status);
    const d = (await r.json()).daily;
    const days = d.time.map((day, i) => ({
      day, rain: d.precipitation_sum[i] ?? 0, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i] }));
    return { lat, lon, days, today: days.length - 1 - FORECAST };
  }

  // Rule of thumb for boletes: a soaking rain (>= 10 mm within 3 days) starts fruiting; mushrooms
  // appear after a lag that depends on warmth and keep coming for about 10 days. Frost or cold stops it.
  const TRIGGER_MM = 10, WINDOW = 10;
  const tmean = d => (d.tmax + d.tmin) / 2;
  const lagFor = t => t >= 16 ? 6 : t >= 12 ? 8 : t >= 8 ? 11 : t >= 5 ? 15 : null;

  function assess(days, today = days.length - 1) {
    const past = days.slice(0, today + 1);
    const lastN = n => past.slice(-n);
    const rain14 = past.slice(-14).reduce((a, d) => a + d.rain, 0);
    const rain3 = lastN(3).reduce((a, d) => a + d.rain, 0);
    const tmean7 = lastN(7).reduce((a, d) => a + tmean(d), 0) / Math.min(7, past.length);
    const frost = lastN(7).filter(d => d.tmin < 0).length;

    // Days on which the 3-day rain sum reaches the trigger; an episode starts at its first such day.
    const sum3 = i => days.slice(Math.max(0, i - 2), i + 1).reduce((a, d) => a + d.rain, 0);
    const triggers = days.map((_, i) => sum3(i) >= TRIGGER_MM);
    const episodeStart = i => { while (i > 0 && triggers[i - 1]) i--; return i; };
    // Rain of the episode starting at i; for past rain only what has actually fallen.
    const rainOf = (i, until = days.length - 1) => { let mm = 0; for (let j = i; j <= until && (j === i || triggers[j]); j++) mm += days[j].rain; return mm; };
    // Warmth from the rain onwards (observed + forecast) decides how fast mushrooms grow.
    const lagAfter = i => lagFor(days.slice(i, i + 7).reduce((a, d) => a + tmean(d), 0) / Math.min(7, days.length - i));

    let fruit = null;
    const lastPast = triggers.slice(0, today + 1).lastIndexOf(true);
    if (lastPast >= 0) {
      const start = episodeStart(lastPast), lag = lagAfter(start);
      if (lag != null) {
        const from = start + lag, to = from + WINDOW;
        if (today < from) fruit = { state: 'coming', rainDay: days[start].day, mm: rainOf(start, today), inDays: from - today, lag };
        else if (today <= to) fruit = { state: 'now', rainDay: days[start].day, mm: rainOf(start, today), since: today - start };
      }
    }
    if (!fruit) {
      const nextRain = triggers.findIndex((t, i) => t && i > today);
      const lag = nextRain >= 0 ? lagAfter(episodeStart(nextRain)) : null;
      if (nextRain >= 0 && lag != null) {
        const start = Math.max(episodeStart(nextRain), today + 1);
        fruit = { state: 'rainAhead', rainDay: days[start].day, mm: rainOf(start), inDays: start + lag - today, lag };
      } else if (frost >= 2 || tmean7 < 5) fruit = { state: 'cold' };
      else {
        const lastWet = past.map(d => d.rain >= 2).lastIndexOf(true);
        fruit = { state: 'dry', dryDays: lastWet < 0 ? past.length : today - lastWet };
      }
    }
    if (frost >= 2 && fruit.state !== 'cold') fruit.frost = true;

    const level = fruit.state === 'now' ? 'good' : ['coming', 'rainAhead'].includes(fruit.state) ? 'medium' : 'poor';
    const why = fruit.state === 'cold' ? ['cold'] : fruit.state === 'dry' ? ['dry'] : [];
    return { rain14, rain3, tmean7, frost, level, why, fruit };
  }

  // Calendar date n days from today, e.g. "19.10." / "Oct 19".
  function dateIn(n, lang) {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: lang === 'de' ? '2-digit' : 'short' });
  }
  const fmtDay = (iso, lang) => new Date(iso + 'T12:00').toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB',
    { weekday: 'short', day: 'numeric', month: lang === 'de' ? '2-digit' : 'short' });

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

  return { load, assess, dateIn, fmtDay, finds, seasonShare, inSeason, locate, geocode };
})();

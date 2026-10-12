// Shared helpers for location, mushroom weather and season (index.html, karte.html).
window.Pilzwetter = (() => {
  const round1 = v => Math.round(v * 10) / 10;

  // Rounded to ~10 km before anything leaves the device. 14 past days, today and a 7-day forecast;
  // days[today] is today, later entries are forecast.
  // Source: Bright Sky (api.brightsky.dev), free DWD open data — station observations plus the
  // MOSMIX forecast, hourly; commercial use allowed with attribution. Covers Germany and its borders.
  const FORECAST = 7, TZ = 'Europe/Berlin';
  const isoDay = ms => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });  // YYYY-MM-DD
  async function load(lat, lon) {
    lat = round1(lat); lon = round1(lon);
    const now = Date.now(), DAY = 864e5;
    const url = `https://api.brightsky.dev/weather?lat=${lat}&lon=${lon}&tz=${TZ}` +
      `&date=${isoDay(now - 14 * DAY)}T01:00&last_date=${isoDay(now + (FORECAST + 1) * DAY)}T00:00`;
    let r = await fetch(url);
    if (r.status >= 500) r = await new Promise(res => setTimeout(res, 1500)).then(() => fetch(url));  // one retry
    if (!r.ok) throw new Error('weather ' + r.status);
    // Hourly values describe the hour ending at the timestamp, so 00:00 still belongs to the day before.
    const byDay = new Map();
    for (const h of (await r.json()).weather) {
      const day = isoDay(Date.parse(h.timestamp) - 36e5);
      const d = byDay.get(day) ?? byDay.set(day, { day, rain: 0, tmax: -Infinity, tmin: Infinity, hours: 0 }).get(day);
      d.rain += h.precipitation ?? 0;
      if (h.temperature != null) { d.tmax = Math.max(d.tmax, h.temperature); d.tmin = Math.min(d.tmin, h.temperature); d.hours++; }
    }
    // Drop incomplete days at the edges (a half day would understate the rain).
    const days = [...byDay.values()].filter(d => d.hours >= 20)
      .map(({ day, rain, tmax, tmin }) => ({ day, rain: Math.round(rain * 10) / 10, tmax, tmin }));
    const today = days.findIndex(d => d.day === isoDay(now));
    if (today < 0) throw new Error('weather: no data for today');
    return { lat, lon, days: days.slice(0, today + FORECAST + 1), today };
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

  // Place search via Nominatim (OpenStreetMap, ODbL). Its usage policy allows commercial use at low
  // volume: one request per search, no autocomplete.
  async function geocode(name, lang) {
    const g = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}` +
      `&format=jsonv2&limit=1&addressdetails=1&accept-language=${lang}`).then(r => r.json());
    const p = g[0];
    if (!p) return null;
    const a = p.address ?? {};
    return { lat: +p.lat, lon: +p.lon, name: [p.name, a.state, a.country_code?.toUpperCase()].filter(Boolean).join(', ') };
  }

  return { load, assess, dateIn, fmtDay, finds, seasonShare, inSeason, locate, geocode };
})();

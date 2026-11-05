// Rekenhulpen. In de echte versie worden selectie, filtering en plots door de
// R-functies van Samen Analyseren gedaan; dit bestand bootst dat na op de nepdata.
(function () {
  "use strict";
  const M = window.MOCK;

  const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const MONTHS_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const en = () => window.I18N && window.I18N.lang === "en";
  const monthName = (i) => {
    const name = (en() ? MONTHS_EN : MONTHS)[i];
    return en() ? name.charAt(0).toUpperCase() + name.slice(1) : name;
  };
  const monthShort = (i) => (en() ? MONTHS_SHORT_EN : MONTHS_SHORT)[i];
  const weekday = (i) => (en() ? WEEKDAYS_EN : WEEKDAYS)[i];

  const fmt = (v, digits = 1) => (v == null || Number.isNaN(v) ? "–" : en() ? v.toFixed(digits) : v.toFixed(digits).replace(".", ","));
  const pct = (v) => `${Math.round(v * 100)}%`;

  function indexRange(start, end) {
    const i0 = M.days.findIndex((d) => d >= start);
    let i1 = -1;
    for (let i = M.days.length - 1; i >= 0; i--) {
      if (M.days[i] <= end) {
        i1 = i;
        break;
      }
    }
    return [i0, i1];
  }

  function select(ids, start, end) {
    const [i0, i1] = indexRange(start, end);
    const series = {};
    ids.forEach((id) => (series[id] = M.values[id].slice(i0, i1 + 1)));
    return {
      dates: M.days.slice(i0, i1 + 1),
      series,
      reference: M.reference.values.slice(i0, i1 + 1),
      humidity: M.humidity.slice(i0, i1 + 1),
    };
  }

  // Extreme waarden boven `cutoff` en reeksen van >= `stuckDays` identieke waarden
  // worden ontbrekend (null), nooit 0.
  function clean(values, filters) {
    const out = values.slice();
    const missing = values.filter((v) => v == null).length;
    let extreme = 0;
    let stuck = 0;
    if (filters.enabled) {
      out.forEach((v, i) => {
        if (v != null && v > filters.cutoff) {
          out[i] = null;
          extreme++;
        }
      });
      let runStart = 0;
      for (let i = 1; i <= out.length; i++) {
        if (i < out.length && out[i] != null && out[i] === out[runStart]) continue;
        if (out[runStart] != null && i - runStart >= filters.stuckDays) {
          for (let j = runStart; j < i; j++) out[j] = null;
          stuck += i - runStart;
        }
        runStart = i;
      }
    }
    return { values: out, missing, extreme, stuck, valid: out.filter((v) => v != null).length };
  }

  const valid = (arr) => arr.filter((v) => v != null && !Number.isNaN(v));
  const count = (arr) => valid(arr).length;
  function mean(arr) {
    const v = valid(arr);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  function median(arr) {
    const v = valid(arr).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  function networkMean(cleanedById, n) {
    const lists = Object.values(cleanedById).map((c) => c.values);
    return Array.from({ length: n }, (_, i) => mean(lists.map((l) => l[i])));
  }

  function rSquared(a, b) {
    const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => x != null && y != null);
    if (pairs.length < 3) return null;
    const mx = mean(pairs.map((p) => p[0]));
    const my = mean(pairs.map((p) => p[1]));
    let sxy = 0, sxx = 0, syy = 0;
    pairs.forEach(([x, y]) => {
      sxy += (x - mx) * (y - my);
      sxx += (x - mx) ** 2;
      syy += (y - my) ** 2;
    });
    return sxx && syy ? (sxy * sxy) / (sxx * syy) : null;
  }

  function groupMean(dates, values, keyFn) {
    const groups = new Map();
    dates.forEach((d, i) => {
      const k = keyFn(d);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(values[i]);
    });
    return new Map([...groups].map(([k, v]) => [k, mean(v)]));
  }

  const dayOfWeek = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
  function shortDate(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${d.getUTCDate()} ${monthShort(d.getUTCMonth())}`;
  }
  function longDate(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return en()
      ? `${monthName(d.getUTCMonth())} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
      : `${d.getUTCDate()} ${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}`;
  }

  window.A = {
    MONTHS, MONTHS_EN, MONTHS_SHORT, WEEKDAYS,
    monthName, monthShort, weekday,
    fmt, pct, select, clean, mean, median, count, networkMean, rSquared, groupMean,
    dayOfWeek, shortDate, longDate,
  };
})();

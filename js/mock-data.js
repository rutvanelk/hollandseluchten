// Nepdata: daggemiddelden PM2.5 voor 6 fictieve sensoren in Haarlem, een fictief
// referentiestation en luchtvochtigheid. Deterministisch (vaste seed), zodat elke
// demo en test dezelfde cijfers geeft.
(function () {
  "use strict";

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20261113);
  function gauss() {
    let u = 0, v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const round1 = (v) => Math.round(v * 10) / 10;

  const START = "2025-11-01";
  const END = "2026-10-31";

  const days = [];
  for (const d = new Date(START + "T00:00:00Z"); d <= new Date(END + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const sensors = [
    { id: "HLL_101", naam: "Schoterweg", buurt: "Haarlem-Noord", factor: 1.18, offset: 0.5 },
    { id: "HLL_102", naam: "Kleverparkweg", buurt: "Haarlem-Noord", factor: 1.1, offset: 0.2 },
    { id: "HLL_103", naam: "Grote Markt", buurt: "Centrum", factor: 1.22, offset: 0.9 },
    { id: "HLL_104", naam: "Amsterdamsevaart", buurt: "Oost", factor: 1.3, offset: 1.4 },
    { id: "HLL_105", naam: "Europaweg", buurt: "Schalkwijk", factor: 1.12, offset: 0.3 },
    { id: "HLL_106", naam: "Zuiderhoutlaan", buurt: "Zuid-West", factor: 1.05, offset: -0.2 },
  ];

  const base = [];
  const humidity = [];
  let ar = 0;
  let episode = 0;
  days.forEach((day, i) => {
    const date = new Date(day + "T00:00:00Z");
    const doy = (date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 864e5;
    const season = Math.cos((2 * Math.PI * (doy - 20)) / 365);
    if (episode <= 0 && season > 0.3 && rand() < 0.05) episode = 3 + Math.floor(rand() * 3);
    const episodeBoost = episode > 0 ? 8 + rand() * 8 : 0;
    episode -= 1;
    ar = 0.7 * ar + 1.8 * gauss();
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? -0.9 : 0;
    const trend = -0.8 * (i / days.length);
    let b = 9 + 4.5 * season + ar + episodeBoost + weekend + trend;
    if (day === "2026-01-01") b += 30; // jaarwisseling
    if (day >= "2026-10-20" && day <= "2026-10-22") b += 13; // regionale episode
    base.push(Math.max(1.5, b));

    let h = 76 + 8 * season + 6 * gauss();
    if (day === "2026-10-12") h = 99; // mistige dag
    humidity.push(Math.round(Math.min(100, Math.max(40, h))));
  });

  const reference = {
    id: "REF_HLM",
    naam: "Referentiestation Haarlem (mock)",
    type: "stedelijke achtergrond",
    values: base.map((b) => round1(Math.max(0.3, b + 0.7 * gauss()))),
  };

  const values = {};
  sensors.forEach((s) => {
    values[s.id] = days.map((day, i) => {
      if (rand() < 0.03) return null;
      let v = base[i] * s.factor + s.offset + 1.2 * gauss();
      if (humidity[i] > 90) v *= 1 + (humidity[i] - 90) * 0.08;
      if (day === "2026-10-12") v *= 2.2;
      if (day === "2026-01-01") v *= 1.5;
      return round1(Math.max(0, v));
    });
  });

  const knownIssues = [
    { sensor: "HLL_104", type: "uitval", start: "2026-02-10", end: "2026-03-05", value: null },
    { sensor: "HLL_105", type: "vastgelopen", start: "2026-06-01", end: "2026-06-28", value: 7.3 },
    { sensor: "HLL_103", type: "extreme waarde", start: "2026-03-14", end: "2026-03-14", value: 186 },
  ];
  knownIssues.forEach((issue) => {
    days.forEach((day, i) => {
      if (day >= issue.start && day <= issue.end) values[issue.sensor][i] = issue.value;
    });
  });

  window.MOCK = {
    period: { start: START, end: END },
    days,
    sensors,
    reference,
    values,
    humidity,
    knownIssues,
  };
})();

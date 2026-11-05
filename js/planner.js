// Vertaalt een vraag naar een analyseplan. Herkent Nederlands en Engels.
// In dit prototype regelgebaseerd; in de echte versie kan een LLM hetzelfde plan invullen.
(function () {
  "use strict";
  const M = window.MOCK;
  const A = window.A;
  const t = (nl, en) => window.I18N.t(nl, en);

  const LABELS = {
    compare_periods: ["Twee periodes vergelijken", "Compare two periods"],
    rank: ["Sensoren vergelijken (ranglijst)", "Compare sensors (ranking)"],
    average: ["Gemiddelde luchtkwaliteit", "Average air quality"],
    trend: ["Verloop over het jaar", "Change over the year"],
    events: ["Opvallende pieken zoeken", "Look for unusual peaks"],
    weekday: ["Weekend versus doordeweeks", "Weekend versus weekdays"],
    threshold: ["Dagen boven een grenswaarde", "Days above a limit"],
    vs_reference: ["Vergelijken met het officiële meetstation", "Compare with the official monitoring station"],
    education: ["Uitleg over de metingen", "What the sensors measure"],
    forecast: ["Voorspelling", "Forecast"],
    source: ["Effect van één bron", "Effect of a single source"],
  };

  const BUURTEN = [
    { naam: "Haarlem-Noord", re: /\bnoord\b|\bnorth\b/ },
    { naam: "Centrum", re: /centrum|binnenstad|\bcentre\b|\bcenter\b|downtown/ },
    { naam: "Oost", re: /\boost\b|\beast\b/ },
    { naam: "Schalkwijk", re: /schalkwijk/ },
    { naam: "Zuid-West", re: /zuid-?west|south-?west/ },
  ];

  const match = (re) => (q) => (q.match(re) || [])[0] || null;

  function detectMonths(q) {
    const found = [];
    [A.MONTHS, A.MONTHS_EN].forEach((list) => {
      list.forEach((name, i) => {
        if (!found.includes(i) && new RegExp(`\\b${name}\\b`).test(q)) found.push(i);
      });
    });
    // nov/dec vallen in 2025, jan t/m okt in 2026: zo blijft alles binnen de data.
    return found.map(monthPeriod).sort((a, b) => a.start.localeCompare(b.start));
  }

  function monthPeriod(m) {
    const y = m >= 10 ? 2025 : 2026;
    const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    return { start, end, label: `${A.monthName(m)} ${y}` };
  }

  function plan(question, overrides = {}) {
    const q = (question || "").toLowerCase();
    const months = detectMonths(q);
    const p = {
      question,
      intent: null,
      status: "ok",
      label: "",
      matchedOn: null,
      assumptions: [],
      userChanges: [],
      component: t("PM2.5 (gekalibreerd)", "PM2.5 (calibrated)"),
      filters: { enabled: true, cutoff: 100, stuckDays: 7 },
      threshold: 15,
      buurt: null,
    };

    const rules = [
      { intent: "forecast", status: "reject", test: match(/voorspel|volgende week|komende (week|dagen)|morgen|hoe (zal|wordt) de|forecast|next week|coming (week|days)|tomorrow|what will/) },
      { intent: "source", status: "reject", test: match(/bouwplaats|fabriek|\btata\b|oorzaak|komt (dat|het) door|effect van|invloed van|impact van|construction|factory|\bcause\b|caused by|effect of|impact of|influence of/) },
      { intent: "education", test: match(/welke (soorten|metingen|gegevens|data)|wat meet|wat (is|betekent) (pm|fijnstof)|wat wordt er gemeten|what kinds of measurements|what do the sensors|what is measured|which measurements/) },
      { intent: "compare_periods", test: () => (months.length >= 2 ? `${months[0].label} / ${months[1].label}` : null) },
      { intent: "vs_reference", test: match(/referentie|officie\w*|luchtmeetnet|meetstation|\brivm\b|reference|official|monitoring station/) },
      { intent: "weekday", test: match(/weekend|doordeweeks|werkdag|weekdag|zaterdag|zondag|weekday|weekdays|saturday|sunday/) },
      { intent: "events", test: match(/ongewoon|uitzonderlijk|opvallend\w*|bijzonder\w*|pieken?\b|uitschieters?|unusual|peaks?|outliers?|spikes?/) },
      { intent: "threshold", test: match(/grens\w*|norm\w*|overschr\w*|\bveilig|gezond|\bwho\b|advieswaarde|boven de|\blimit\b|guideline|exceed|\bthreshold\b|above the/) },
      { intent: "rank", test: match(/welke sensor|slechtste|hoogste|vuilste|schoonste|\bbeste\b|ranglijst|vergelijk de sensoren|which sensor|worst|highest|dirtiest|cleanest|ranking|compare the sensors/) },
      { intent: "trend", test: match(/beter of slechter|slechter of beter|\btrend\b|verbeter\w*|verslechter\w*|ontwikkel\w*|in de loop van|better or worse|worse or better|improv|deteriorat|over the (year|course)/) },
      { intent: "average", test: match(/gemiddeld\w*|doorsnee|over het algemeen|average|on average|overall/) },
    ];
    for (const r of rules) {
      const hit = r.test(q);
      if (hit) {
        p.intent = r.intent;
        p.status = r.status || "ok";
        p.matchedOn = hit;
        break;
      }
    }
    if (!p.intent) {
      p.status = "clarify";
      p.label = t("Nog niet duidelijk", "Not clear yet");
      return p;
    }
    p.label = t(LABELS[p.intent][0], LABELS[p.intent][1]);
    if (p.status === "reject" || p.intent === "education") return p;

    const b = BUURTEN.find((x) => x.re.test(q));
    p.buurt = b ? b.naam : null;
    if (!b && /buurt|wijk|straat|neighbourhood|neighborhood|\bstreet\b|\barea\b/.test(q)) {
      p.assumptions.push(t(
        "Je noemt je buurt, maar niet welke. Ik neem alle sensoren in Haarlem; kies hieronder een wijk om te verfijnen.",
        "You mention your neighbourhood, but not which one. I am using every sensor in Haarlem; pick a neighbourhood below to narrow it down."
      ));
    } else if (!b) {
      p.assumptions.push(t(
        `Geen wijk genoemd: ik gebruik alle ${M.sensors.length} sensoren in Haarlem.`,
        `No neighbourhood mentioned: I am using all ${M.sensors.length} sensors in Haarlem.`
      ));
    }
    if (overrides.buurt !== undefined && (overrides.buurt || null) !== p.buurt) {
      p.buurt = overrides.buurt || null;
      p.userChanges.push(t(
        `Wijk aangepast naar: ${p.buurt || "alle wijken"}`,
        `Neighbourhood changed to: ${p.buurt || "all neighbourhoods"}`
      ));
    }
    p.sensors = M.sensors.filter((s) => !p.buurt || s.buurt === p.buurt).map((s) => s.id);

    if (p.intent === "compare_periods") {
      p.periods = months.slice(0, 2);
      p.period = {
        start: p.periods[0].start,
        end: p.periods[1].end,
        label: t(`${p.periods[0].label} en ${p.periods[1].label}`, `${p.periods[0].label} and ${p.periods[1].label}`),
      };
      p.assumptions.push(t(
        "Geen jaar genoemd: ik neem de meest recente maanden met data (november–december 2025, januari–oktober 2026).",
        "No year mentioned: I use the most recent months with data (November–December 2025, January–October 2026)."
      ));
    } else {
      p.period = detectPeriod(q, p, months);
      if (overrides.start && overrides.end && (overrides.start !== p.period.start || overrides.end !== p.period.end)) {
        let [start, end] = [overrides.start, overrides.end].sort();
        start = start < M.period.start ? M.period.start : start;
        end = end > M.period.end ? M.period.end : end;
        p.period = { start, end, label: `${A.longDate(start)} – ${A.longDate(end)}` };
        p.userChanges.push(t(`Periode aangepast naar ${p.period.label}`, `Period changed to ${p.period.label}`));
      }
    }

    if (p.intent === "threshold") {
      const num = q.replace(/pm\s?(2[.,]5|10)/g, "").match(/boven (?:de )?(\d+)|above (?:the )?(\d+)/);
      if (num) {
        p.threshold = Number(num[1] || num[2]);
      } else {
        p.assumptions.push(t(
          "Geen grenswaarde genoemd: ik gebruik het WHO-advies voor het daggemiddelde (15 µg/m³, 2021).",
          "No limit mentioned: I use the WHO guideline for the daily average (15 µg/m³, 2021)."
        ));
      }
    }

    applyFilterOverrides(p, overrides);
    return p;
  }

  function detectPeriod(q, p, months) {
    if (months.length === 1) return months[0];
    if (/vorige maand|afgelopen maand|laatste maand|last month|previous month/.test(q)) {
      p.assumptions.push(t(
        "‘Vorige maand’ = oktober 2026, de laatste volledige maand met data.",
        "“Last month” = October 2026, the last full month with data."
      ));
      return monthPeriod(9);
    }
    if (/winter/.test(q)) return { start: "2025-12-01", end: "2026-02-28", label: t("winter 2025–2026", "winter 2025–2026") };
    if (/zomer|summer/.test(q)) return { start: "2026-06-01", end: "2026-08-31", label: t("zomer 2026", "summer 2026") };
    if (p.intent === "events") {
      p.assumptions.push(t(
        "Geen periode genoemd: ik kijk naar de laatste maand met data (oktober 2026).",
        "No period mentioned: I look at the last month with data (October 2026)."
      ));
      return monthPeriod(9);
    }
    if (!/dit jaar|afgelopen jaar|12 maanden|this year|past year|12 months/.test(q)) {
      p.assumptions.push(t(
        "Geen periode genoemd: ik gebruik de afgelopen 12 maanden.",
        "No period mentioned: I use the past 12 months."
      ));
    }
    const range = `${A.longDate(M.period.start)} – ${A.longDate(M.period.end)}`;
    return { start: M.period.start, end: M.period.end, label: t(`afgelopen 12 maanden (${range})`, `the past 12 months (${range})`) };
  }

  function applyFilterOverrides(p, o) {
    const f = p.filters;
    if (o.filtersEnabled !== undefined && o.filtersEnabled !== f.enabled) {
      f.enabled = o.filtersEnabled;
      p.userChanges.push(f.enabled
        ? t("Filter op uitschieters aangezet", "Outlier filter turned on")
        : t("Filter op uitschieters uitgezet", "Outlier filter turned off"));
    }
    if (o.cutoff !== undefined && o.cutoff !== f.cutoff) {
      f.cutoff = o.cutoff;
      p.userChanges.push(t(
        `Bovengrens extreme waarden aangepast naar ${o.cutoff} µg/m³`,
        `Upper limit for extreme values changed to ${o.cutoff} µg/m³`
      ));
    }
    if (o.stuckDays !== undefined && o.stuckDays !== f.stuckDays) {
      f.stuckDays = o.stuckDays;
      p.userChanges.push(t(
        `Vastgelopen sensor: vanaf ${o.stuckDays} dagen dezelfde waarde`,
        `Stuck sensor: from ${o.stuckDays} days with the same value`
      ));
    }
    if (p.intent === "threshold" && o.threshold !== undefined && o.threshold !== p.threshold) {
      p.threshold = o.threshold;
      p.userChanges.push(t(`Grenswaarde aangepast naar ${o.threshold} µg/m³`, `Limit changed to ${o.threshold} µg/m³`));
    }
  }

  window.Planner = { plan };
})();

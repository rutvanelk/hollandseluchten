// Per soort vraag: welke analyse, welk antwoord, welke kanttekeningen.
// Elke rekenstap wordt via ctx.step() in de audit trail vastgelegd.
(function () {
  "use strict";
  const M = window.MOCK;
  const A = window.A;
  const C = window.Charts;
  const { fmt, pct } = A;
  const t = (nl, en) => window.I18N.t(nl, en);
  const refName = () => window.I18N.refName();
  const follow = (key) => window.I18N.follow(key);

  const COLORS = { sensors: "#2563eb", ref: "#111827", warn: "#d97706", grey: "#9ca3af", red: "#dc2626", hum: "#0891b2" };

  const caveat = {
    absolute: () => t(
      "Goedkope sensoren overschatten PM2.5, vooral bij pieken en hoge luchtvochtigheid. Gebruik de sensorgetallen niet om te toetsen aan WHO- of EU-normen; gebruik daarvoor het officiële meetstation.",
      "Low-cost sensors overestimate PM2.5, especially during peaks and high humidity. Do not check sensor numbers against WHO or EU limits; use the official monitoring station for that."
    ),
    regional: () => t(
      "PM2.5 verspreidt zich over grote afstanden; een groot deel komt van buiten de stad of uit het buitenland. Verschillen van een paar µg/m³ tussen plekken zijn moeilijk te duiden.",
      "PM2.5 travels long distances; a large share comes from outside the city or from abroad. Differences of a few µg/m³ between places are hard to interpret."
    ),
    season: () => t(
      "PM2.5 is in de winter hoger dan in de zomer (lagere menglaag, stookseizoen). Vergelijk periodes daarom altijd met het referentiestation erbij.",
      "PM2.5 is higher in winter than in summer (a lower mixing layer, and the heating season). Always compare periods with the reference station alongside."
    ),
    daily: () => t(
      "Dit prototype rekent met daggemiddelden op nepdata; de echte versie gebruikt uurwaarden uit Samen Analyseren.",
      "This prototype uses daily averages on mock data; the real version uses hourly values from Samen Analyseren."
    ),
  };

  const NORMS = { who: 5, eu2030: 10, euNow: 25 };

  const health = () => t(
    "Er is geen acuut gevaar. Fijnstof is vooral ongezond als je er jarenlang aan blootstaat, en er is geen grens waaronder het helemaal onschadelijk is: hoe lager, hoe beter. Mensen met astma of COPD merken vieze dagen soms wel direct.",
    "There is no acute danger. Particulate matter is mainly harmful when you are exposed for many years, and there is no level below which it is completely harmless: lower is better. People with asthma or COPD can notice dirty days straight away."
  );
  const self = () => t(
    "Zelf iets doen? Lokaal zijn houtstook en verkeer de grootste bronnen. Heb je longklachten, beperk dan op vieze dagen zware inspanning buiten.",
    "What can you do? Locally, wood burning and traffic are the largest sources. If you have lung problems, avoid heavy outdoor exercise on dirty days."
  );

  function levelText(v) {
    if (v <= NORMS.who) return t("onder het gezondheidsadvies van de WHO. Dat is erg schoon voor Nederland.", "below the WHO health guideline. That is very clean for the Netherlands.");
    if (v <= NORMS.eu2030) return t("onder de wettelijke grens, ook onder de strengere grens die vanaf 2030 geldt. Wel boven het gezondheidsadvies van de WHO.", "below the legal limit, and also below the stricter limit that applies from 2030. It is still above the WHO health guideline.");
    if (v <= NORMS.euNow) return t("onder de huidige wettelijke grens, maar boven de strengere grens vanaf 2030 en boven het gezondheidsadvies van de WHO.", "below the current legal limit, but above the stricter limit from 2030 and above the WHO health guideline.");
    return t("boven de huidige wettelijke grens.", "above the current legal limit.");
  }

  function shortLevel(v) {
    if (v <= NORMS.who) return t("onder het gezondheidsadvies van de WHO", "below the WHO health guideline");
    if (v <= NORMS.eu2030) return t("binnen de wettelijke grens, maar boven het gezondheidsadvies van de WHO", "within the legal limit, but above the WHO health guideline");
    if (v <= NORMS.euNow) return t("binnen de huidige wettelijke grens, maar boven de grens die vanaf 2030 geldt", "within the current legal limit, but above the limit that applies from 2030");
    return t("boven de wettelijke grens", "above the legal limit");
  }

  const sensorMeta = (id) => M.sensors.find((s) => s.id === id);

  function sensorPhrase(plan) {
    if (plan.sensors.length !== 1) return t(`${plan.sensors.length} sensoren`, `${plan.sensors.length} sensors`);
    const s = sensorMeta(plan.sensors[0]);
    return t(`de sensor aan de ${s.naam} (${s.id})`, `the sensor on ${s.naam} (${s.id})`);
  }

  const listDates = (events) => events.map((e) => A.shortDate(e.date)).join(", ");
  const sensorLegend = () => ({ name: t("Gemiddelde Hollandse Luchten-sensoren", "Average Hollandse Luchten sensors"), color: COLORS.sensors });
  const refLegend = () => ({ name: refName(), color: COLORS.ref, dashed: true });
  const kindLabel = (k) => ({ regionaal: t("regionaal", "regional"), vocht: t("vocht", "humidity"), lokaal: t("lokaal", "local") })[k];

  function tickFor(dates) {
    if (dates.length > 62) return (d) => (d.endsWith("-01") ? A.monthShort(Number(d.slice(5, 7)) - 1) : null);
    return (d, i) => (i % 7 === 0 ? A.shortDate(d) : null);
  }

  function prepare(plan, ctx, start = plan.period.start, end = plan.period.end) {
    const sel = A.select(plan.sensors, start, end);
    ctx.step(
      t("Data selecteren", "Select data"),
      "select_date_range · select_all_stations · select_component",
      { sensoren: plan.sensors, van: start, tot: end, meetwaarde: plan.component, referentiestation: M.reference.id },
      t(
        `${plan.sensors.length} sensor(en) × ${sel.dates.length} dagen, plus referentiestation`,
        `${plan.sensors.length} sensor(s) × ${sel.dates.length} days, plus the reference station`
      )
    );

    const cleaned = {};
    let extreme = 0, stuck = 0, missing = 0;
    plan.sensors.forEach((id) => {
      const c = A.clean(sel.series[id], plan.filters);
      cleaned[id] = c;
      extreme += c.extreme;
      stuck += c.stuck;
      missing += c.missing;
    });
    ctx.step(
      t("Uitschieters filteren", "Filter outliers"),
      "select_outlier_cutoff",
      plan.filters.enabled
        ? { bovengrens: `${plan.filters.cutoff} µg/m³`, vastgelopen_sensor: t(`≥ ${plan.filters.stuckDays} dagen dezelfde waarde`, `≥ ${plan.filters.stuckDays} days with the same value`) }
        : { filter: t("uit", "off") },
      plan.filters.enabled
        ? t(
            `${extreme} extreme dagwaarde(n) en ${stuck} dag(en) van een vastgelopen sensor als ontbrekend gemarkeerd`,
            `${extreme} extreme daily value(s) and ${stuck} day(s) from a stuck sensor marked as missing`
          )
        : t("Niet gefilterd (door gebruiker uitgezet)", "Not filtered (turned off by the user)")
    );
    if (!plan.filters.enabled) {
      ctx.caveat(t(
        "Het filter op uitschieters staat uit. Extreme waarden en vastgelopen sensoren tellen mee in de gemiddelden.",
        "The outlier filter is off. Extreme values and stuck sensors are included in the averages."
      ));
    }

    const coverage = {};
    const low = [];
    plan.sensors.forEach((id) => {
      coverage[id] = cleaned[id].valid / sel.dates.length;
      if (coverage[id] < 0.75) low.push(id);
    });
    ctx.step(
      t("Datadekking controleren", "Check data coverage"),
      "add_metadata_param_tables",
      { minimale_dekking: t("75%", "75%") },
      low.length
        ? t(`Lage dekking: ${low.map((id) => `${id} (${pct(coverage[id])})`).join(", ")}`, `Low coverage: ${low.map((id) => `${id} (${pct(coverage[id])})`).join(", ")}`)
        : t(
            `Alle sensoren hebben ≥ 75% bruikbare dagen (${missing} ontbrekende sensordagen in totaal)`,
            `Every sensor has ≥ 75% usable days (${missing} missing sensor-days in total)`
          )
    );
    if (low.length) {
      ctx.caveat(t(
        `${low.join(", ")} heeft minder dan 75% bruikbare data in deze periode; uitkomsten voor deze sensor zijn minder betrouwbaar.`,
        `${low.join(", ")} has less than 75% usable data in this period; results for this sensor are less reliable.`
      ));
    }
    ctx.caveat(caveat.daily());

    return { dates: sel.dates, cleaned, coverage, low, net: A.networkMean(cleaned, sel.dates.length), ref: sel.reference, hum: sel.humidity };
  }

  function indicesIn(dates, p) {
    return dates.reduce((acc, d, i) => (d >= p.start && d <= p.end ? acc.concat(i) : acc), []);
  }

  function sensorRows(plan, d) {
    return plan.sensors
      .map((id) => ({ id, s: sensorMeta(id), mean: A.mean(d.cleaned[id].values), cov: d.coverage[id] }))
      .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
  }

  function sensorBars(rows, refMean, highlight) {
    return C.barChart({
      items: rows.map((r) => ({
        label: r.s.naam,
        sub: `${r.id} · ${pct(r.cov)} ${t("data", "data")}`,
        value: r.mean,
        color: r.cov < 0.75 ? COLORS.grey : r === highlight ? COLORS.warn : COLORS.sensors,
      })),
      refLine: refMean != null ? { value: refMean, label: `${refName()}: ${fmt(refMean)}` } : null,
      legendItems: [
        { name: t("Gemiddelde per sensor", "Average per sensor"), color: COLORS.sensors },
        { name: t("Hoogste (betrouwbare) sensor", "Highest (reliable) sensor"), color: COLORS.warn },
        { name: t("Te weinig data (< 75%)", "Too little data (< 75%)"), color: COLORS.grey },
      ],
    });
  }

  const Intents = {
    compare_periods(plan, ctx) {
      const [p1, p2] = plan.periods;
      const d = prepare(plan, ctx, p1.start, p2.end);
      const stat = (p) => {
        const idx = indicesIn(d.dates, p);
        return { net: A.mean(idx.map((i) => d.net[i])), ref: A.mean(idx.map((i) => d.ref[i])) };
      };
      const s1 = stat(p1), s2 = stat(p2);
      ctx.step(
        t("Gemiddelde per periode", "Average per period"),
        "add_bar_plot",
        { perioden: [p1.label, p2.label], groepen: [t("sensoren", "sensors"), t("referentiestation", "reference station")] },
        t(
          `Sensoren ${fmt(s1.net)} → ${fmt(s2.net)} µg/m³ · referentie ${fmt(s1.ref)} → ${fmt(s2.ref)} µg/m³`,
          `Sensors ${fmt(s1.net)} → ${fmt(s2.net)} µg/m³ · reference ${fmt(s1.ref)} → ${fmt(s2.ref)} µg/m³`
        )
      );
      const diff = s2.net - s1.net;
      const refDiff = s2.ref - s1.ref;
      const higher = diff >= 0;
      const rel = s1.net ? ` (${higher ? "+" : "−"}${Math.round((Math.abs(diff) / s1.net) * 100)}%)` : "";
      const same = Math.sign(diff) === Math.sign(refDiff);
      const dirtier = higher ? p2.label : p1.label;
      const meaning = same
        ? `<p><b>${t(`In ${dirtier} was de lucht wat viezer, maar dat lag niet aan je buurt.`, `In ${dirtier} the air was a bit dirtier, but that was not down to your neighbourhood.`)}</b> ${t("Het officiële meetstation zag hetzelfde, dus het verschil komt door het weer en het seizoen in de hele regio. In de winter is fijnstof bijna altijd hoger: er wordt meer gestookt en de lucht mengt minder.", "The official station saw the same thing, so the difference comes from the weather and the season across the region. Particulate matter is almost always higher in winter: more heating, and the air mixes less.")}</p>` +
          `<p>${t("Je hoeft hier dus niets mee te doen.", "So there is nothing you need to do about this.")} ${Math.abs(diff) < 2 ? t("Het verschil is bovendien klein.", "The difference is small as well.") : ""}</p>`
        : `<p><b>${t("Hier is nog geen duidelijke conclusie uit te trekken.", "There is no clear conclusion to draw yet.")}</b> ${t("De sensoren en het officiële meetstation zijn het oneens over welke maand viezer was. Dat wijst eerder op een probleem met een sensor dan op een echte verandering in je buurt.", "The sensors and the official station disagree about which month was dirtier. That points to a problem with a sensor rather than a real change in your neighbourhood.")}</p>`;
      let body = `<p>${t(
        `Gemiddeld meet ${sensorPhrase(plan)} <b>${fmt(s1.net)} µg/m³</b> in ${p1.label} en <b>${fmt(s2.net)} µg/m³</b> in ${p2.label}. Dat is ${fmt(Math.abs(diff))} µg/m³ ${higher ? "hoger" : "lager"}${rel}.`,
        `On average ${sensorPhrase(plan)} measured <b>${fmt(s1.net)} µg/m³</b> in ${p1.label} and <b>${fmt(s2.net)} µg/m³</b> in ${p2.label}. That is ${fmt(Math.abs(diff))} µg/m³ ${higher ? "higher" : "lower"}${rel}.`
      )}</p>`;
      body += same
        ? `<p>${t(
            `Het officiële meetstation ziet hetzelfde: ${fmt(s1.ref)} → ${fmt(s2.ref)} µg/m³. Het verschil speelt dus in de hele regio en komt waarschijnlijk door weer en seizoen, niet door iets in jouw wijk.`,
            `The official station sees the same thing: ${fmt(s1.ref)} → ${fmt(s2.ref)} µg/m³. The difference is regional, and most likely comes from weather and season, not from something in your neighbourhood.`
          )}</p>`
        : `<p>${t(
            `Het officiële meetstation ziet het andersom (${fmt(s1.ref)} → ${fmt(s2.ref)} µg/m³). Dat is reden tot voorzichtigheid: kijk of een sensor in deze periode afwijkt.`,
            `The official station sees the opposite (${fmt(s1.ref)} → ${fmt(s2.ref)} µg/m³). That is a reason to be careful: check whether a sensor is off in this period.`
          )}</p>`;
      if (Math.abs(diff) < 2) {
        body += `<p>${t(
          "Het verschil is klein (minder dan 2 µg/m³). Dat valt binnen wat goedkope sensoren onderling al kunnen verschillen.",
          "The difference is small (less than 2 µg/m³). That is within what low-cost sensors already differ from each other."
        )}</p>`;
      }
      ctx.caveat(caveat.season());
      ctx.caveat(caveat.absolute());
      return {
        short: t(
          `In ${p2.label} was fijnstof gemiddeld ${fmt(Math.abs(diff))} µg/m³ ${higher ? "hoger" : "lager"} dan in ${p1.label}.`,
          `In ${p2.label}, particulate matter was on average ${fmt(Math.abs(diff))} µg/m³ ${higher ? "higher" : "lower"} than in ${p1.label}.`
        ),
        meaning,
        body,
        chart: C.barChart({
          items: [
            { label: p1.label, sub: t("sensoren", "sensors"), value: s1.net, color: COLORS.sensors },
            { label: p2.label, sub: t("sensoren", "sensors"), value: s2.net, color: COLORS.sensors },
            { label: p1.label, sub: t("referentie", "reference"), value: s1.ref, color: COLORS.ref },
            { label: p2.label, sub: t("referentie", "reference"), value: s2.ref, color: COLORS.ref },
          ],
          legendItems: [sensorLegend(), { name: refName(), color: COLORS.ref }],
        }),
        followups: [follow("peaks"), follow("vsRef")],
      };
    },

    rank(plan, ctx) {
      const d = prepare(plan, ctx);
      const rows = sensorRows(plan, d);
      const reliable = rows.filter((r) => r.cov >= 0.75 && r.mean != null);
      const refMean = A.mean(d.ref);
      ctx.step(
        t("Gemiddelde per sensor", "Average per sensor"),
        "add_bar_plot",
        { groepering: t("per sensor", "per sensor"), periode: plan.period.label },
        rows.map((r) => `${r.id}: ${fmt(r.mean)}`).join(" · ")
      );
      ctx.caveat(caveat.regional());
      ctx.caveat(caveat.absolute());
      if (reliable.length < 2) {
        return {
          short: t("Er zijn te weinig sensoren met genoeg data om een ranglijst te maken.", "There are too few sensors with enough data to make a ranking."),
          body: `<p>${t("Kies een grotere wijk of een andere periode.", "Choose a larger neighbourhood or a different period.")}</p>`,
          chart: sensorBars(rows, refMean, null),
          followups: [follow("worst")],
        };
      }
      const top = reliable[0];
      const bottom = reliable[reliable.length - 1];
      const spread = top.mean - bottom.mean;
      const where = plan.buurt || "Haarlem";
      let body = `<p>${t(
        `Over ${plan.period.label} meet <b>${top.s.naam}</b> (${top.id}, ${top.s.buurt}) gemiddeld het hoogst: <b>${fmt(top.mean)} µg/m³</b>. Het laagst is ${bottom.s.naam} met ${fmt(bottom.mean)} µg/m³.`,
        `Over ${plan.period.label}, <b>${top.s.naam}</b> (${top.id}, ${top.s.buurt}) measures the highest on average: <b>${fmt(top.mean)} µg/m³</b>. The lowest is ${bottom.s.naam} at ${fmt(bottom.mean)} µg/m³.`
      )}</p>`;
      body += spread < 3
        ? `<p>${t(
            `Het verschil tussen hoogste en laagste is maar ${fmt(spread)} µg/m³. Goedkope sensoren verschillen onderling vaak al zoveel, dus je kunt niet zeggen dat de lucht daar echt slechter is.`,
            `The gap between highest and lowest is only ${fmt(spread)} µg/m³. Low-cost sensors often differ by that much anyway, so you cannot say the air there is really worse.`
          )}</p>`
        : `<p>${t(
            `Het verschil is ${fmt(spread)} µg/m³. Dat kan een lokale bron zijn, maar ook een verschil tussen de sensoren zelf. Vergelijk elke sensor met het referentiestation om dat te onderscheiden.`,
            `The gap is ${fmt(spread)} µg/m³. That could be a local source, but also a difference between the sensors themselves. Compare each sensor with the reference station to tell them apart.`
          )}</p>`;
      const excluded = rows.filter((r) => r.cov < 0.75);
      if (excluded.length) {
        body += `<p class="muted">${t("Niet meegenomen in de ranglijst (te weinig data):", "Left out of the ranking (too little data):")} ${excluded.map((r) => r.s.naam).join(", ")}.</p>`;
      }
      const meaning = spread < 3
        ? `<p><b>${t(`Waar je in ${where} woont, maakt voor fijnstof weinig uit.`, `Where you live in ${where} makes little difference for particulate matter.`)}</b> ${t("De verschillen tussen de sensoren zijn kleiner dan wat deze sensoren onderling al kunnen afwijken.", "The differences between the sensors are smaller than how far these sensors can already disagree.")} ${t(`${top.s.naam} staat bovenaan, maar dat betekent niet dat de lucht daar echt slechter is.`, `${top.s.naam} is at the top, but that does not mean the air there is really worse.`)}</p>` +
          `<p>${t("Dat past bij hoe fijnstof werkt: het meeste waait over grote afstanden aan en is in de hele stad ongeveer gelijk.", "That fits how particulate matter behaves: most of it blows in from far away and is roughly the same across the city.")}</p>`
        : `<p><b>${t(`Bij ${top.s.naam} is fijnstof mogelijk wat hoger dan elders.`, `Particulate matter may be somewhat higher at ${top.s.naam}.`)}</b> ${t("Dat is nog geen bewijs voor een lokale bron. Eerst controleren of de sensor goed werkt en goed hangt (niet bij een afzuigkap of schoorsteen). Klopt de sensor, dan is het de moeite waard om dit samen met de meetgroep verder uit te zoeken.", "That is not yet proof of a local source. First check that the sensor works and is hung properly (not by an extractor fan or a chimney). If the sensor is sound, it is worth looking into this with the measurement group.")}</p>`;
      return {
        short: t(
          `${top.s.naam} meet gemiddeld het hoogst, maar het verschil met de laagste sensor is ${spread < 3 ? "klein" : "merkbaar"} (${fmt(spread)} µg/m³).`,
          `${top.s.naam} measures the highest on average, but the gap with the lowest sensor is ${spread < 3 ? "small" : "noticeable"} (${fmt(spread)} µg/m³).`
        ),
        meaning,
        body,
        chart: sensorBars(rows, refMean, top),
        followups: [follow("vsRef"), follow("weekend")],
      };
    },

    average(plan, ctx) {
      const d = prepare(plan, ctx);
      const rows = sensorRows(plan, d);
      const netMean = A.mean(d.net);
      const refMean = A.mean(d.ref);
      const means = rows.filter((r) => r.mean != null).map((r) => r.mean);
      ctx.step(
        t("Gemiddelde over periode", "Average over the period"),
        "add_bar_plot",
        { periode: plan.period.label },
        t(`Sensoren gemiddeld ${fmt(netMean)} µg/m³ · referentie ${fmt(refMean)} µg/m³`, `Sensors average ${fmt(netMean)} µg/m³ · reference ${fmt(refMean)} µg/m³`)
      );
      ctx.caveat(caveat.absolute());

      let wijk = "";
      if (plan.buurt) {
        const all = A.select(M.sensors.map((s) => s.id), plan.period.start, plan.period.end);
        const cleanedAll = {};
        Object.keys(all.series).forEach((id) => (cleanedAll[id] = A.clean(all.series[id], plan.filters)));
        const cityMean = A.mean(A.networkMean(cleanedAll, all.dates.length));
        const diff = netMean - cityMean;
        ctx.step(
          t("Wijk vergelijken met heel Haarlem", "Compare the neighbourhood with all of Haarlem"),
          "add_bar_plot · select_group_name_switch",
          { groepen: [plan.buurt, t("heel Haarlem", "all of Haarlem")] },
          t(`${plan.buurt}: ${fmt(netMean)} · heel Haarlem: ${fmt(cityMean)} µg/m³ (sensoren)`, `${plan.buurt}: ${fmt(netMean)} · all of Haarlem: ${fmt(cityMean)} µg/m³ (sensors)`)
        );
        wijk = Math.abs(diff) < 1.5
          ? `<p>${t(
              `${plan.buurt} verschilt nauwelijks van de rest van Haarlem (${fmt(netMean)} tegen ${fmt(cityMean)} µg/m³ op de sensoren). Je woont hier dus niet in een viezere of schonere plek dan gemiddeld in de stad.`,
              `${plan.buurt} barely differs from the rest of Haarlem (${fmt(netMean)} versus ${fmt(cityMean)} µg/m³ on the sensors). You do not live somewhere dirtier or cleaner than the city average.`
            )}</p>`
          : `<p>${t(
              `De sensoren in ${plan.buurt} meten ${fmt(Math.abs(diff))} µg/m³ ${diff > 0 ? "meer" : "minder"} dan gemiddeld in Haarlem. Dat kan aan de wijk liggen, maar ook aan de sensor zelf. Vergelijk de sensor met het meetstation om dat te checken.`,
              `The sensors in ${plan.buurt} measure ${fmt(Math.abs(diff))} µg/m³ ${diff > 0 ? "more" : "less"} than the Haarlem average. That could be the neighbourhood, but also the sensor itself. Compare the sensor with the monitoring station to check.`
            )}</p>`;
      }
      const fullYear = d.dates.length >= 330;
      const typical = refMean >= 7 && refMean <= 11 ? t(" Dat is vergelijkbaar met de meeste plekken in Nederland.", " That is comparable with most places in the Netherlands.") : "";
      const meaning =
        `<p><b>${t(`De lucht ligt ${levelText(refMean)}`, `The air is ${levelText(refMean)}`)}</b>${typical}</p>` +
        C.normScale({ value: refMean, valueLabel: t(`Hier: ${fmt(refMean)} µg/m³ (meetstation)`, `Here: ${fmt(refMean)} µg/m³ (station)`) }) +
        wijk +
        `<p>${health()}</p><p>${self()}</p>` +
        (fullYear ? "" : `<p class='muted'>${t("Let op: normen gaan over een heel jaar. Deze periode is korter, dus de vergelijking is een indicatie.", "Note: limits apply to a full year. This period is shorter, so the comparison is only an indication.")}</p>`);

      const range = means.length > 1 ? t(` (per sensor van ${fmt(Math.min(...means))} tot ${fmt(Math.max(...means))})`, ` (per sensor from ${fmt(Math.min(...means))} to ${fmt(Math.max(...means))})`) : "";
      return {
        short: t(
          `De lucht ${plan.buurt ? `in ${plan.buurt}` : "in Haarlem"} zit gemiddeld ${shortLevel(refMean)}.`,
          `The air ${plan.buurt ? `in ${plan.buurt}` : "in Haarlem"} is on average ${shortLevel(refMean)}.`
        ),
        meaning,
        body:
          `<p>${t(
            `Over ${plan.period.label} meet ${sensorPhrase(plan)} gemiddeld <b>${fmt(netMean)} µg/m³</b>${range}. Het officiële meetstation meet in dezelfde periode <b>${fmt(refMean)} µg/m³</b>.`,
            `Over ${plan.period.label}, ${sensorPhrase(plan)} measured an average of <b>${fmt(netMean)} µg/m³</b>${range}. The official station measured <b>${fmt(refMean)} µg/m³</b> in the same period.`
          )}</p>` +
          `<p>${t("Voor de vergelijking met normen gebruik ik het getal van het meetstation: goedkope sensoren meten structureel wat hoger.", "For the comparison with limits I use the station’s number: low-cost sensors measure consistently a bit higher.")}</p>`,
        chart: sensorBars(rows, refMean, null),
        followups: [follow("who"), follow("trend")],
      };
    },

    trend(plan, ctx) {
      const d = prepare(plan, ctx);
      const byMonth = (vals) => A.groupMean(d.dates, vals, (x) => x.slice(0, 7));
      const net = byMonth(d.net);
      const ref = byMonth(d.ref);
      const keys = [...net.keys()];
      const label = (k) => `${A.monthShort(Number(k.slice(5, 7)) - 1)} '${k.slice(2, 4)}`;
      ctx.step(t("Maandgemiddelden", "Monthly averages"), "add_timeseries_plot", { aggregatie: t("maand", "month"), reeksen: [t("sensoren", "sensors"), t("referentiestation", "reference station")] }, t(`${keys.length} maanden`, `${keys.length} months`));

      const hi = keys.reduce((a, b) => (net.get(b) > net.get(a) ? b : a));
      const lo = keys.reduce((a, b) => (net.get(b) < net.get(a) ? b : a));
      const diffs = keys.map((k) => net.get(k) - ref.get(k));
      const first = A.mean(diffs.slice(0, 3));
      const last = A.mean(diffs.slice(-3));
      const drift = last - first;
      ctx.step(
        t("Sensor min referentie per maand (driftcontrole)", "Sensor minus reference per month (drift check)"),
        t("aanvullend: verschil per maand", "added: difference per month"),
        { eerste_3_maanden: fmt(first), laatste_3_maanden: fmt(last) },
        Math.abs(drift) > 1.5
          ? t(`Verschil verandert ${fmt(drift)} µg/m³: mogelijke sensordrift`, `The gap changes by ${fmt(drift)} µg/m³: possible sensor drift`)
          : t("Verschil met referentie stabiel: geen aanwijzing voor sensordrift", "Gap with the reference is stable: no sign of sensor drift"),
        "Aanvullend"
      );
      ctx.caveat(caveat.season());
      ctx.caveat(t(
        "Eén jaar data is te kort voor een echte trend. Daarvoor vergelijk je dezelfde maanden over meerdere jaren.",
        "One year of data is too short for a real trend. For that you compare the same months across several years."
      ));
      return {
        short: t(
          "Het verloop wordt vooral door het seizoen bepaald; met één jaar data is geen betrouwbare trend te geven.",
          "The pattern is mostly seasonal; one year of data is not enough for a reliable trend."
        ),
        meaning:
          `<p><b>${t("Dat het in de winter viezer is dan in de zomer is normaal", "Dirtier air in winter than in summer is normal")}</b> ${t("en gebeurt in heel Nederland. Of de lucht in Haarlem echt schoner of viezer wordt, kan één jaar aan data nog niet laten zien.", "and happens across the Netherlands. One year of data cannot yet show whether the air in Haarlem is really getting cleaner or dirtier.")}</p>` +
          `<p>${t("Landelijk daalt fijnstof al jaren langzaam. Wil je dat voor je eigen buurt volgen, dan heb je meerdere jaren data van dezelfde sensoren nodig.", "Nationally, particulate matter has been falling slowly for years. To follow that in your own neighbourhood you need several years of data from the same sensors.")}</p>`,
        body:
          `<p>${t(
            `Het hoogste maandgemiddelde was in <b>${label(hi)}</b> (${fmt(net.get(hi))} µg/m³), het laagste in <b>${label(lo)}</b> (${fmt(net.get(lo))} µg/m³). Het officiële meetstation volgt hetzelfde patroon: winter hoog, zomer laag.`,
            `The highest monthly average was in <b>${label(hi)}</b> (${fmt(net.get(hi))} µg/m³), the lowest in <b>${label(lo)}</b> (${fmt(net.get(lo))} µg/m³). The official station follows the same pattern: high in winter, low in summer.`
          )}</p>` +
          `<p>${t("Of de lucht structureel beter of slechter wordt, kun je pas zeggen als je bijvoorbeeld januari van dit jaar vergelijkt met januari van vorige jaren.", "You can only say whether the air is structurally better or worse once you compare, for example, January this year with January in earlier years.")} ${
            Math.abs(drift) > 1.5
              ? t("Let op: het verschil tussen sensoren en meetstation verandert in de loop van het jaar. Dat kan op sensordrift wijzen.", "Note: the gap between the sensors and the station changes over the year. That can point to sensor drift.")
              : t("Het verschil tussen sensoren en meetstation blijft stabiel, dus de sensoren lijken niet te verlopen.", "The gap between the sensors and the station stays stable, so the sensors do not appear to drift.")
          }</p>`,
        chart: C.lineChart({
          labels: keys,
          tickLabel: label,
          series: [
            { name: sensorLegend().name, color: COLORS.sensors, values: keys.map((k) => net.get(k)), width: 2.2 },
            { name: refName(), color: COLORS.ref, values: keys.map((k) => ref.get(k)), dashed: true, width: 2.2 },
          ],
        }),
        followups: [follow("janDec"), follow("peaks")],
      };
    },

    events(plan, ctx) {
      const d = prepare(plan, ctx);
      const medNet = A.median(d.net);
      const medRef = A.median(d.ref);
      const limit = Math.max(20, 1.8 * medNet);
      const flagged = d.dates
        .map((date, i) => ({ date, net: d.net[i], ref: d.ref[i], hum: d.hum[i] }))
        .filter((e) => e.net != null && e.net > limit)
        .map((e) => ({ ...e, kind: e.ref > 1.6 * medRef ? "regionaal" : e.hum >= 90 ? "vocht" : "lokaal" }));
      ctx.step(
        t("Opvallende dagen zoeken", "Find unusual days"),
        "add_timeseries_plot · add_calenderplot",
        { regel: t(`daggemiddelde sensoren > ${fmt(limit)} µg/m³ (1,8 × mediaan, minimaal 20)`, `sensor daily average > ${fmt(limit)} µg/m³ (1.8 × median, at least 20)`) },
        t(`${flagged.length} opvallende dag(en)`, `${flagged.length} unusual day(s)`)
      );
      ctx.step(
        t("Pieken duiden met referentie en luchtvochtigheid", "Interpret peaks using the reference and humidity"),
        t("aanvullend: classificatie", "added: classification"),
        { regionaal: t(`referentie > ${fmt(1.6 * medRef)} µg/m³`, `reference > ${fmt(1.6 * medRef)} µg/m³`), vocht: t("luchtvochtigheid ≥ 90%", "humidity ≥ 90%") },
        flagged.map((e) => `${e.date}: ${kindLabel(e.kind)}`).join(" · ") || t("geen", "none"),
        "Aanvullend"
      );
      ctx.caveat(caveat.absolute());

      const kindText = {
        regionaal: t("Ook het officiële meetstation meet verhoogd. Waarschijnlijk echte luchtvervuiling in de hele regio, bijvoorbeeld door weinig wind of aanvoer uit het buitenland.", "The official station is elevated too. Probably real air pollution across the region, for example from little wind or air arriving from abroad."),
        vocht: t("Het officiële meetstation ziet niets bijzonders en de luchtvochtigheid was hoog. Waarschijnlijk zag de sensor waterdruppels aan voor fijnstof.", "The official station sees nothing unusual and humidity was high. The sensor probably mistook water droplets for particulate matter."),
        lokaal: t("Alleen de sensoren meten verhoogd. Het kan een lokale bron zijn, maar ook een sensorfout. Kijk of één sensor de piek veroorzaakt.", "Only the sensors are elevated. It could be a local source, but also a sensor fault. Check whether one sensor causes the peak."),
      };
      const colorFor = { regionaal: COLORS.red, vocht: COLORS.hum, lokaal: COLORS.warn };
      const body = flagged.length
        ? `<p>${t(`${flagged.length} dag(en) in ${plan.period.label} waren opvallend hoog:`, `${flagged.length} day(s) in ${plan.period.label} were unusually high:`)}</p><ul class="events">${flagged
            .slice(0, 8)
            .map((e) => `<li><span class="tag" style="--c:${colorFor[e.kind]}">${kindLabel(e.kind)}</span><b>${A.longDate(e.date)}</b>: ${t("sensoren", "sensors")} ${fmt(e.net)} µg/m³, ${t("meetstation", "station")} ${fmt(e.ref)} µg/m³, ${t("luchtvochtigheid", "humidity")} ${e.hum}%. ${kindText[e.kind]}</li>`)
            .join("")}</ul>`
        : `<p>${t(`Geen dagen gevonden boven ${fmt(limit)} µg/m³ in ${plan.period.label}.`, `No days found above ${fmt(limit)} µg/m³ in ${plan.period.label}.`)}</p>`;
      const ofKind = (k) => flagged.filter((e) => e.kind === k);
      let meaning = "";
      if (ofKind("regionaal").length) {
        meaning += `<p><b>${t(`Op ${listDates(ofKind("regionaal"))} was de lucht echt viezer dan normaal`, `On ${listDates(ofKind("regionaal"))} the air really was dirtier than usual`)}</b>${t(", in de hele regio. Dat gebeurt een paar keer per jaar, meestal bij weinig wind. Heb je astma of andere longklachten, dan kun je op zulke dagen beter geen zware inspanning buiten doen.", ", across the region. That happens a few times a year, usually when there is little wind. If you have asthma or other lung problems, it is better to avoid heavy outdoor exercise on those days.")}</p>`;
      }
      if (ofKind("vocht").length) {
        meaning += `<p><b>${t(`De piek op ${listDates(ofKind("vocht"))} was waarschijnlijk geen echte vervuiling.`, `The peak on ${listDates(ofKind("vocht"))} was probably not real pollution.`)}</b> ${t("Het was erg vochtig of mistig, en dan ziet de sensor waterdruppels aan voor fijnstof. Hier hoef je je geen zorgen over te maken.", "It was very humid or foggy, and then the sensor mistakes water droplets for particulate matter. Nothing to worry about.")}</p>`;
      }
      if (ofKind("lokaal").length) {
        meaning += `<p><b>${t(`Op ${listDates(ofKind("lokaal"))} zagen alleen onze sensoren een piek.`, `On ${listDates(ofKind("lokaal"))} only our sensors saw a peak.`)}</b> ${t("Dat kan een lokale bron zijn, zoals houtstook of een brand, maar ook een sensorfout. Weet je wat er die dag gebeurde? Dat helpt bij het duiden.", "That could be a local source, such as wood burning or a fire, but also a sensor fault. Do you know what happened that day? It helps to interpret it.")}</p>`;
      }
      if (!flagged.length) meaning = `<p><b>${t("Er waren geen dagen waarop de lucht duidelijk viezer was dan normaal.", "There were no days when the air was clearly dirtier than usual.")}</b></p>`;
      return {
        short: flagged.length
          ? t(
              `${flagged.length} opvallende dag(en); ${ofKind("regionaal").length} daarvan zag ook het officiële meetstation.`,
              `${flagged.length} unusual day(s); the official station also saw ${ofKind("regionaal").length} of them.`
            )
          : t("Geen opvallende pieken gevonden.", "No unusual peaks found."),
        meaning,
        body,
        chart: C.lineChart({
          labels: d.dates,
          tickLabel: tickFor(d.dates),
          markers: flagged.map((e) => ({ at: e.date, color: colorFor[e.kind] })),
          series: [
            { name: sensorLegend().name, color: COLORS.sensors, values: d.net },
            { name: refName(), color: COLORS.ref, values: d.ref, dashed: true },
          ],
        }),
        followups: [follow("vsRef"), follow("who")],
      };
    },

    weekday(plan, ctx) {
      const d = prepare(plan, ctx);
      const order = [1, 2, 3, 4, 5, 6, 0];
      const byDow = A.groupMean(d.dates, d.net, A.dayOfWeek);
      const isWeekend = (x) => [0, 6].includes(A.dayOfWeek(x));
      const split = (vals) => ({
        we: A.mean(d.dates.map((x, i) => (isWeekend(x) ? vals[i] : null))),
        wd: A.mean(d.dates.map((x, i) => (!isWeekend(x) ? vals[i] : null))),
      });
      const net = split(d.net);
      const ref = split(d.ref);
      ctx.step(
        t("Gemiddelde per dag van de week", "Average by day of the week"),
        "add_timevariation_weekly_plot",
        { groepering: t("dag van de week", "day of the week"), periode: plan.period.label },
        t(`Doordeweeks ${fmt(net.wd)} · weekend ${fmt(net.we)} µg/m³ (referentie ${fmt(ref.wd)} · ${fmt(ref.we)})`, `Weekdays ${fmt(net.wd)} · weekend ${fmt(net.we)} µg/m³ (reference ${fmt(ref.wd)} · ${fmt(ref.we)})`)
      );
      const diff = net.wd - net.we;
      ctx.caveat(caveat.regional());
      return {
        short: Math.abs(diff) < 1
          ? t("Er is nauwelijks verschil tussen weekend en doordeweeks.", "There is hardly any difference between the weekend and weekdays.")
          : t(
              `In het weekend is fijnstof gemiddeld ${fmt(Math.abs(diff))} µg/m³ ${diff > 0 ? "lager" : "hoger"} dan doordeweeks.`,
              `At the weekend, particulate matter is on average ${fmt(Math.abs(diff))} µg/m³ ${diff > 0 ? "lower" : "higher"} than on weekdays.`
            ),
        meaning: Math.abs(diff) < 1
          ? `<p><b>${t("Of het weekend is of doordeweeks, maakt voor fijnstof weinig uit.", "Weekend or weekday makes little difference for particulate matter.")}</b> ${t("Fijnstof komt grotendeels van ver; het verkeer in je eigen straat bepaalt maar een klein deel. Wil je weten hoeveel verkeer bijdraagt, dan zegt NO₂ (stikstofdioxide) meer.", "Most particulate matter comes from far away; traffic on your own street only accounts for a small part. If you want to know how much traffic contributes, NO₂ (nitrogen dioxide) says more.")}</p>`
          : `<p><b>${t(`In het weekend is de lucht ${diff > 0 ? "iets schoner" : "iets viezer"}.`, `At the weekend the air is ${diff > 0 ? "a bit cleaner" : "a bit dirtier"}.`)}</b> ${diff > 0 ? t("Waarschijnlijk door minder verkeer en bedrijvigheid.", "Probably because there is less traffic and activity.") : t("Mogelijk door meer houtstook in het weekend.", "Possibly because of more wood burning at the weekend.")} ${t("Het verschil is klein vergeleken met het verschil tussen zomer en winter.", "The difference is small compared with the difference between summer and winter.")}</p>`,
        body:
          `<p>${t(
            `Doordeweeks meten de sensoren gemiddeld <b>${fmt(net.wd)} µg/m³</b>, in het weekend <b>${fmt(net.we)} µg/m³</b>. Het officiële meetstation: ${fmt(ref.wd)} doordeweeks en ${fmt(ref.we)} in het weekend.`,
            `On weekdays the sensors measure <b>${fmt(net.wd)} µg/m³</b> on average, at the weekend <b>${fmt(net.we)} µg/m³</b>. The official station: ${fmt(ref.wd)} on weekdays and ${fmt(ref.we)} at the weekend.`
          )}</p>` +
          `<p>${t("Een klein weekendeffect past bij minder verkeer, maar PM2.5 komt grotendeels van ver. Voor verkeer is NO₂ een betere graadmeter dan fijnstof.", "A small weekend effect fits with less traffic, but most PM2.5 comes from far away. For traffic, NO₂ is a better indicator than particulate matter.")}</p>`,
        chart: C.barChart({
          items: order.map((k) => ({ label: A.weekday(k), value: byDow.get(k), color: k === 0 || k === 6 ? COLORS.warn : COLORS.sensors })),
          legendItems: [
            { name: t("Doordeweeks (sensoren)", "Weekdays (sensors)"), color: COLORS.sensors },
            { name: t("Weekend (sensoren)", "Weekend (sensors)"), color: COLORS.warn },
          ],
        }),
        followups: [follow("worst"), follow("vsRef")],
      };
    },

    threshold(plan, ctx) {
      const d = prepare(plan, ctx);
      const limit = plan.threshold;
      const netOver = d.net.filter((v) => v != null && v > limit).length;
      const refOver = d.ref.filter((v) => v != null && v > limit).length;
      ctx.step(
        t("Dagen boven grenswaarde tellen", "Count days above the limit"),
        "add_timeseries_plot",
        { grenswaarde: t(`${limit} µg/m³ (daggemiddelde)`, `${limit} µg/m³ (daily average)`) },
        t(`Meetstation: ${refOver} dagen · sensoren: ${netOver} dagen (van ${d.dates.length})`, `Station: ${refOver} days · sensors: ${netOver} days (of ${d.dates.length})`)
      );
      ctx.caveat(caveat.absolute());
      ctx.caveat(t(
        "Het WHO-advies (2021) is 15 µg/m³ als daggemiddelde, dat maximaal 3–4 dagen per jaar overschreden mag worden, en 5 µg/m³ als jaargemiddelde.",
        "The WHO guideline (2021) is 15 µg/m³ as a daily average, to be exceeded on at most 3–4 days a year, and 5 µg/m³ as an annual average."
      ));
      const fullYear = d.dates.length >= 330;
      let meaning;
      if (limit === 15) {
        meaning =
          `<p><b>${t("De WHO raadt aan dat het daggemiddelde hooguit 3 à 4 dagen per jaar boven 15 µg/m³ komt.", "The WHO recommends that the daily average exceeds 15 µg/m³ on at most 3 or 4 days a year.")}</b> ${t(`Volgens het meetstation gebeurde dat hier ${refOver} keer${fullYear ? "" : " in deze periode"}.`, `According to the station that happened here ${refOver} time(s)${fullYear ? "" : " in this period"}.`)} ` +
          (refOver > 4
            ? t("Dat is vaker dan de WHO aanraadt. Dat geldt voor het grootste deel van Nederland, vooral in de winter.", "That is more often than the WHO recommends. The same is true for most of the Netherlands, especially in winter.")
            : t("Dat valt binnen het advies.", "That is within the guideline.")) +
          `</p><p>${t("Het WHO-advies is een gezondheidsadvies, geen wet. De EU voert vanaf 2030 een daggrens in van 25 µg/m³, die maximaal 18 dagen per jaar overschreden mag worden.", "The WHO guideline is health advice, not a law. From 2030 the EU introduces a daily limit of 25 µg/m³, which may be exceeded on at most 18 days a year.")}</p><p>${health()}</p>`;
      } else {
        meaning = `<p><b>${t(`Volgens het meetstation lag het daggemiddelde op ${refOver} dag(en) boven de door jou gekozen grens van ${limit} µg/m³.`, `According to the station the daily average was above your chosen limit of ${limit} µg/m³ on ${refOver} day(s).`)}</b> ${t("Kijk in de grafiek wanneer dat was: meestal in de winter en bij weinig wind.", "Look at the chart to see when: usually in winter and when there is little wind.")}</p><p>${health()}</p>`;
      }
      return {
        short: t(
          `Volgens het officiële meetstation lag het daggemiddelde op ${refOver} dag(en) boven ${limit} µg/m³.`,
          `According to the official station the daily average was above ${limit} µg/m³ on ${refOver} day(s).`
        ),
        meaning,
        body:
          `<p>${t(
            `In ${plan.period.label} lag het daggemiddelde van het officiële meetstation op <b>${refOver} van de ${d.dates.length} dagen</b> boven ${limit} µg/m³.`,
            `In ${plan.period.label} the official station’s daily average was above ${limit} µg/m³ on <b>${refOver} of ${d.dates.length} days</b>.`
          )}</p>` +
          `<p>${t(
            `De sensoren tellen <b>${netOver} dagen</b>. Dat is ${netOver > refOver ? "meer" : "niet meer"}, omdat goedkope sensoren vooral bij hoge waarden en vochtig weer overschatten. Voor de vraag of een norm wordt overschreden is het getal van het meetstation leidend; de sensoren laten vooral zien <i>wanneer</i> het hoog was.`,
            `The sensors count <b>${netOver} days</b>. That is ${netOver > refOver ? "more" : "not more"}, because low-cost sensors overestimate especially at high values and in humid weather. For whether a limit is exceeded, the station’s number is the one that counts; the sensors mainly show <i>when</i> it was high.`
          )}</p>`,
        chart: C.lineChart({
          labels: d.dates,
          tickLabel: tickFor(d.dates),
          threshold: { value: limit, label: t(`grenswaarde ${limit} µg/m³`, `limit ${limit} µg/m³`) },
          series: [
            { name: sensorLegend().name, color: COLORS.sensors, values: d.net },
            { name: refName(), color: COLORS.ref, values: d.ref, dashed: true },
          ],
        }),
        followups: [follow("peaks"), t("Wat is de gemiddelde luchtkwaliteit in Haarlem?", "What is the average air quality in Haarlem?")],
      };
    },

    vs_reference(plan, ctx) {
      const d = prepare(plan, ctx);
      const refMean = A.mean(d.ref);
      const rows = plan.sensors.map((id) => {
        const vals = d.cleaned[id].values;
        const paired = vals.map((v, i) => (v != null && d.ref[i] != null ? v - d.ref[i] : null));
        const mean = A.mean(vals);
        return { id, s: sensorMeta(id), mean, diff: A.mean(paired), ratio: mean / refMean, r2: A.rSquared(vals, d.ref), cov: d.coverage[id] };
      });
      ctx.step(
        t("Tijdreeks sensoren naast referentie", "Time series of sensors next to the reference"),
        "add_timeseries_plot",
        { reeksen: [t("gemiddelde sensoren", "average sensors"), M.reference.id] },
        t(`${d.dates.length} dagen`, `${d.dates.length} days`)
      );
      ctx.step(
        t("Verschil, verhouding en R² per sensor", "Difference, ratio and R² per sensor"),
        t("aanvullend: statistiek", "added: statistics"),
        { methode: t("gemiddeld verschil (sensor − referentie), verhouding, R² op daggemiddelden", "mean difference (sensor − reference), ratio, R² on daily averages") },
        rows.map((r) => `${r.id}: ${r.diff >= 0 ? "+" : ""}${fmt(r.diff)} µg/m³, R² ${fmt(r.r2, 2)}`).join(" · "),
        "Aanvullend"
      );
      const avgRatio = A.mean(rows.map((r) => r.ratio));
      const avgR2 = A.mean(rows.map((r) => r.r2));
      const pctHigh = Math.round((avgRatio - 1) * 100);
      ctx.caveat(t(
        "Een hoge R² betekent dat de sensor het patroon goed volgt, niet dat de getallen kloppen. Een sensor die steeds twee keer zo hoog meet kan ook een hoge R² hebben.",
        "A high R² means the sensor follows the pattern well, not that the numbers are right. A sensor that always reads twice as high can still have a high R²."
      ));
      ctx.caveat(caveat.absolute());
      const table = `<table class="stats"><thead><tr><th>${t("Sensor", "Sensor")}</th><th>${t("Gemiddeld", "Average")}</th><th>${t("Verschil met meetstation", "Difference from station")}</th><th>${t("Verhouding", "Ratio")}</th><th>R²</th><th>${t("Data", "Data")}</th></tr></thead><tbody>${rows
        .map((r) => `<tr><td>${r.s.naam} <span class="muted">${r.id}</span></td><td>${fmt(r.mean)}</td><td>${r.diff >= 0 ? "+" : ""}${fmt(r.diff)} µg/m³</td><td>${fmt(r.ratio, 2)}×</td><td>${fmt(r.r2, 2)}</td><td>${pct(r.cov)}</td></tr>`)
        .join("")}</tbody></table>`;
      return {
        short: t(
          `De sensoren meten gemiddeld ${pctHigh}% hoger dan het officiële meetstation, maar volgen het patroon ${avgR2 > 0.7 ? "goed" : "matig"} (gemiddelde R² ${fmt(avgR2, 2)}).`,
          `The sensors measure on average ${pctHigh}% higher than the official station, but follow the pattern ${avgR2 > 0.7 ? "well" : "only moderately"} (average R² ${fmt(avgR2, 2)}).`
        ),
        meaning:
          `<p><b>${t(`Lees de getallen van de sensoren als ‘ongeveer ${pctHigh}% te hoog’.`, `Read the sensor numbers as ‘about ${pctHigh}% too high’.`)}</b> ${t("Wil je weten hoe schoon de lucht echt is, kijk dan naar het officiële meetstation.", "If you want to know how clean the air really is, look at the official station.")}</p>` +
          `<p>${t(
            `De sensoren zijn ${avgR2 > 0.7 ? "wel" : "maar beperkt"} goed om te zien <i>wanneer</i> het vies is en of jouw plek afwijkt van de rest van de stad. Daar zijn ze voor bedoeld.`,
            `The sensors are ${avgR2 > 0.7 ? "good" : "only somewhat useful"} for seeing <i>when</i> it is dirty and whether your place differs from the rest of the city. That is what they are for.`
          )}</p>`,
        body:
          `<p>${t(
            `Het officiële meetstation meet in deze periode gemiddeld <b>${fmt(refMean)} µg/m³</b>. De sensoren zitten daar structureel boven; dat klopt met eerder onderzoek van de GGD naar deze sensoren.`,
            `The official station measures <b>${fmt(refMean)} µg/m³</b> on average in this period. The sensors sit consistently above that; that matches earlier GGD research on these sensors.`
          )}</p>` +
          `<p>${t("Pieken en dalen vallen wel op dezelfde dagen. De sensoren zijn dus vooral bruikbaar om te zien <i>wanneer</i> het vies is en hoe plekken onderling verschillen, minder om het precieze niveau te bepalen.", "Peaks and dips do fall on the same days. The sensors are therefore mainly useful for seeing <i>when</i> it is dirty and how places differ, less so for the exact level.")}</p>` +
          table,
        chart: C.lineChart({
          labels: d.dates,
          tickLabel: tickFor(d.dates),
          series: [
            { name: sensorLegend().name, color: COLORS.sensors, values: d.net },
            { name: refName(), color: COLORS.ref, values: d.ref, dashed: true },
          ],
        }),
        followups: [follow("worst"), follow("peaks")],
      };
    },

    education(plan, ctx) {
      ctx.step(t("Metadata van de sensoren tonen", "Show the sensor metadata"), "add_metadata_param_tables", { bron: t("sensormetadata", "sensor metadata") }, t("Overzicht meetwaarden", "Overview of measurements"));
      const rows = [
        ["PM2.5 (ruw)", "PM2.5 (raw)", "Fijnstof kleiner dan 2,5 micrometer, in µg/m³", "Particulate matter smaller than 2.5 micrometres, in µg/m³", "Indicatief; overschat bij pieken en vocht", "Indicative; overestimates during peaks and humidity"],
        ["PM2.5 (gekalibreerd)", "PM2.5 (calibrated)", "Ruwe waarde gecorrigeerd met een RIVM-kalibratie", "Raw value corrected with an RIVM calibration", "Beter, maar nog steeds geen officiële meting", "Better, but still not an official measurement"],
        ["PM10", "PM10", "Grover fijnstof", "Coarser particulate matter", "Deze sensoren meten PM10 niet betrouwbaar", "These sensors do not measure PM10 reliably"],
        ["Temperatuur, luchtvochtigheid, luchtdruk", "Temperature, humidity, air pressure", "Gemeten in het sensorkastje", "Measured inside the sensor box", "Vooral nuttig om fijnstofpieken te duiden", "Mainly useful for interpreting particulate peaks"],
        ["Officieel meetstation", "Official monitoring station", "Luchtmeetnet (RIVM/GGD), gevalideerd", "Luchtmeetnet (RIVM/GGD), validated", "Referentie voor normen", "The reference for limits"],
        ["Weer (KNMI)", "Weather (KNMI)", "Windrichting, windsnelheid, temperatuur, vocht", "Wind direction, wind speed, temperature, humidity", "Gevalideerd", "Validated"],
      ];
      return {
        short: t("De sensoren meten fijnstof (PM2.5), temperatuur, luchtvochtigheid en luchtdruk.", "The sensors measure particulate matter (PM2.5), temperature, humidity and air pressure."),
        body: `<table class="stats"><thead><tr><th>${t("Meetwaarde", "Measurement")}</th><th>${t("Wat is het?", "What is it?")}</th><th>${t("Hoe betrouwbaar?", "How reliable?")}</th></tr></thead><tbody>${rows
          .map((r) => `<tr><td>${t(r[0], r[1])}</td><td>${t(r[2], r[3])}</td><td>${t(r[4], r[5])}</td></tr>`)
          .join("")}</tbody></table>`,
        chart: "",
        followups: [follow("vsRef"), t("Wat is de gemiddelde luchtkwaliteit in Haarlem?", "What is the average air quality in Haarlem?")],
      };
    },

    forecast(plan, ctx) {
      ctx.step(t("Vraag beoordelen", "Assess the question"), t("geen", "none"), { soort: t("voorspelling", "forecast") }, t("Niet uitgevoerd: Samen Analyseren heeft geen voorspellingsfuncties", "Not run: Samen Analyseren has no forecasting functions"), "Aanvullend");
      ctx.caveat(t(
        "Een voorspelling op basis van een paar goedkope sensoren zou schijnzekerheid geven. Luchtmeetnet publiceert wel een officiële verwachting.",
        "A forecast based on a few low-cost sensors would look more certain than it is. Luchtmeetnet does publish an official forecast."
      ));
      return {
        short: t("Deze vraag kan ik niet betrouwbaar beantwoorden.", "I cannot answer this question reliably."),
        body:
          `<p>${t("Voorspellen zit niet in de gevalideerde analysefuncties, en luchtkwaliteit hangt sterk af van het weer van de komende dagen. Voor een verwachting kun je het beste op", "Forecasting is not part of the validated analysis functions, and air quality depends strongly on the weather of the coming days. For a forecast, the best place is")} <a href='https://www.luchtmeetnet.nl' target='_blank' rel='noopener'>luchtmeetnet.nl</a>.</p>` +
          `<p>${t("Wat ik wel kan: laten zien hoe het de afgelopen tijd was, en wanneer het vaak hoog is.", "What I can do: show how it has been recently, and when it is often high.")}</p>`,
        chart: "",
        followups: [follow("peaks"), follow("trend")],
      };
    },

    source(plan, ctx) {
      ctx.step(t("Vraag beoordelen", "Assess the question"), t("geen", "none"), { soort: t("effect van één bron", "effect of a single source") }, t("Niet uitgevoerd: met PM2.5 is het effect van één bron niet vast te stellen", "Not run: PM2.5 cannot establish the effect of a single source"), "Aanvullend");
      ctx.caveat(caveat.regional());
      return {
        short: t("Het effect van één bron kan ik met fijnstofsensoren niet vaststellen.", "I cannot establish the effect of a single source with particulate sensors."),
        body:
          `<p>${t("PM2.5 komt voor een groot deel van ver weg. Een bouwplaats of weg voegt meestal maar een paar µg/m³ toe, en dat valt binnen de meetonzekerheid van deze sensoren. Voor verkeer is NO₂ een betere graadmeter.", "A large share of PM2.5 comes from far away. A construction site or a road usually adds only a few µg/m³, and that falls within the uncertainty of these sensors. For traffic, NO₂ is a better indicator.")}</p>` +
          `<p>${t("Wat ik wel kan: sensoren dichtbij en verder weg vergelijken, en kijken of pieken ook bij het officiële meetstation zichtbaar zijn. Met windrichting (concentratieroos) kun je daarna zien of hogere waarden vooral uit één richting komen. Dat is een aanwijzing, geen bewijs.", "What I can do: compare sensors nearby and further away, and see whether peaks also show up at the official station. With wind direction (a pollution rose) you can then see whether higher values mainly come from one direction. That is a clue, not proof.")}</p>`,
        chart: "",
        followups: [follow("worst"), follow("peaks")],
      };
    },

    clarify(plan, ctx) {
      ctx.step(t("Vraag beoordelen", "Assess the question"), t("geen", "none"), { herkend: t("nee", "no") }, t("Geen passende analyse gevonden; gebruiker gevraagd om te kiezen", "No matching analysis found; the user was asked to choose"), "Aanvullend");
      return {
        short: t("Ik weet nog niet welke analyse bij je vraag past.", "I do not yet know which analysis fits your question."),
        body: `<p>${t("Kies hieronder wat het meest op je vraag lijkt, of formuleer hem anders (noem bijvoorbeeld een wijk, een maand of ‘weekend’).", "Pick below what is closest to your question, or phrase it differently (mention a neighbourhood, a month, or “weekend”, for example).")}</p>`,
        chart: "",
        followups: [follow("worst"), follow("janDec"), follow("peaks"), follow("average")],
      };
    },
  };

  window.Intents = Intents;
})();

// Minimale SVG-grafieken, zodat de demo zonder internet of libraries werkt.
(function () {
  "use strict";

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function niceMax(v) {
    if (!(v > 0)) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const k of [1, 2, 4, 6, 8, 10]) if (k * p >= v * 1.05) return k * p;
    return 10 * p;
  }

  const fmtTick = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));

  function frame(W, H, m, ymax, unit) {
    let s = "";
    for (let k = 0; k <= 4; k++) {
      const v = (ymax * k) / 4;
      const y = H - m.b - (v / ymax) * (H - m.t - m.b);
      s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
      s += `<text class="tick" x="${m.l - 6}" y="${y + 4}" text-anchor="end">${fmtTick(v)}</text>`;
    }
    s += `<text class="unit" x="${m.l}" y="${m.t - 8}">${esc(unit)}</text>`;
    return s;
  }

  function legend(items) {
    return `<div class="legend">${items
      .map((i) => `<span><i class="${i.dashed ? "dashed" : ""}" style="--c:${i.color}"></i>${esc(i.name)}</span>`)
      .join("")}</div>`;
  }

  function thresholdLine(W, m, y, threshold) {
    return (
      `<line class="threshold" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>` +
      `<text class="threshold-label" x="${W - m.r}" y="${y - 6}" text-anchor="end">${esc(threshold.label)}</text>`
    );
  }

  function lineChart({ labels, series, tickLabel, threshold, markers = [], unit = "µg/m³", height = 280 }) {
    const W = 760, H = height, m = { t: 26, r: 16, b: 28, l: 44 };
    const vals = series.flatMap((s) => s.values).filter((v) => v != null);
    const ymax = niceMax(Math.max(0, ...vals, threshold ? threshold.value : 0));
    const n = labels.length;
    const x = (i) => m.l + (n <= 1 ? 0.5 : i / (n - 1)) * (W - m.l - m.r);
    const y = (v) => H - m.b - (v / ymax) * (H - m.t - m.b);

    let s = frame(W, H, m, ymax, unit);
    labels.forEach((l, i) => {
      const t = tickLabel ? tickLabel(l, i) : l;
      if (t) s += `<text class="tick" x="${x(i)}" y="${H - m.b + 16}" text-anchor="middle">${esc(t)}</text>`;
    });
    markers.forEach((mk) => {
      const i = labels.indexOf(mk.at);
      if (i >= 0) s += `<line class="marker" x1="${x(i)}" x2="${x(i)}" y1="${m.t}" y2="${H - m.b}" style="stroke:${mk.color}"/>`;
    });
    if (threshold) s += thresholdLine(W, m, y(threshold.value), threshold);
    series.forEach((ser) => {
      let d = "";
      let pen = false;
      ser.values.forEach((v, i) => {
        if (v == null) {
          pen = false;
          return;
        }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      s += `<path d="${d}" fill="none" stroke="${ser.color}" stroke-width="${ser.width || 1.6}"${ser.dashed ? ' stroke-dasharray="5 3"' : ""}/>`;
      if (n <= 31) {
        ser.values.forEach((v, i) => {
          if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${ser.color}"/>`;
        });
      }
    });
    return `<div class="chart">${legend(series)}<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg></div>`;
  }

  function barChart({ items, refLine, legendItems, unit = "µg/m³", height = 260 }) {
    const W = 760, H = height, m = { t: 26, r: 16, b: 44, l: 44 };
    const vals = items.map((it) => it.value).filter((v) => v != null);
    const ymax = niceMax(Math.max(0, ...vals, refLine ? refLine.value : 0));
    const band = (W - m.l - m.r) / items.length;
    const bw = Math.min(70, band * 0.62);
    const y = (v) => H - m.b - (v / ymax) * (H - m.t - m.b);

    let s = frame(W, H, m, ymax, unit);
    items.forEach((it, i) => {
      const cx = m.l + band * (i + 0.5);
      if (it.value != null) {
        s += `<rect x="${cx - bw / 2}" y="${y(it.value)}" width="${bw}" height="${H - m.b - y(it.value)}" rx="3" fill="${it.color}"/>`;
        s += `<text class="bar-value" x="${cx}" y="${y(it.value) - 6}" text-anchor="middle">${fmtTick(Math.round(it.value * 10) / 10)}</text>`;
      } else {
        s += `<text class="tick" x="${cx}" y="${H - m.b - 6}" text-anchor="middle">${esc(window.I18N.t("geen data", "no data"))}</text>`;
      }
      s += `<text class="tick" x="${cx}" y="${H - m.b + 16}" text-anchor="middle">${esc(it.label)}</text>`;
      if (it.sub) s += `<text class="tick sub" x="${cx}" y="${H - m.b + 31}" text-anchor="middle">${esc(it.sub)}</text>`;
    });
    if (refLine) s += thresholdLine(W, m, y(refLine.value), refLine);
    return `<div class="chart">${legendItems ? legend(legendItems) : ""}<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg></div>`;
  }

  // Schaal van 0–30 µg/m³ met de WHO-advieswaarde en de EU-grenswaarden voor het
  // jaargemiddelde PM2.5, en een pijl op de gemeten waarde.
  function normScale({ value, valueLabel }) {
    const W = 760, H = 100, l = 24, r = 24, max = 30, top = 40;
    const x = (v) => l + (Math.min(Math.max(v, 0), max) / max) * (W - l - r);
    const zones = [
      [0, 5, "#16a34a"],
      [5, 10, "#a3c93a"],
      [10, 25, "#f59e0b"],
      [25, 30, "#dc2626"],
    ];
    const marks = [
      [5, window.I18N.t("WHO-advies", "WHO guideline")],
      [10, window.I18N.t("EU-grens vanaf 2030", "EU limit from 2030")],
      [25, window.I18N.t("EU-grens nu", "EU limit now")],
    ];
    let s = "";
    zones.forEach(([a, b, c]) => {
      s += `<rect x="${x(a)}" y="${top}" width="${x(b) - x(a)}" height="14" fill="${c}"/>`;
    });
    marks.forEach(([v, name]) => {
      s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 4}" y2="${top + 18}" stroke="#111827" stroke-width="1.5"/>`;
      s += `<text class="tick" x="${x(v)}" y="${top + 32}" text-anchor="middle">${v}</text>`;
      s += `<text class="tick sub" x="${x(v)}" y="${top + 46}" text-anchor="middle">${esc(name)}</text>`;
    });
    s += `<text class="tick" x="${x(0)}" y="${top + 32}" text-anchor="middle">0</text>`;
    const vx = x(value);
    s += `<path d="M${vx - 8},${top - 14} L${vx + 8},${top - 14} L${vx},${top - 2} Z" fill="#111827"/>`;
    const lx = Math.min(Math.max(vx, 150), W - 150);
    s += `<text class="bar-value" x="${lx}" y="${top - 20}" text-anchor="middle">${esc(valueLabel)}</text>`;
    return `<div class="chart scale"><svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg></div>`;
  }

  window.Charts = { lineChart, barChart, normScale, esc };
})();

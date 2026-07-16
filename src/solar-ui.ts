/** Solar tab: reads the assumptions form, draws the cumulative cash-flow chart. */
import { simulate, type SolarInput, type SolarResult } from "./solar";
import {
  $,
  currencyFrom,
  money,
  moneyCompact,
  parseNumber,
  segmentValue,
  wireSegment,
  type Currency,
} from "./ui-common";

const num = (id: string) => parseNumber(($(id) as HTMLInputElement).value);

/** Percent-entry fields hold e.g. 1.5 for 1.5%; the model wants 0.015. */
const pct = (id: string) => num(id) / 100;

function readInput(): SolarInput {
  return {
    systemCost: num("solarSystemCost"),
    solarCapacityKw: num("solarCapacity"),
    batteryCapacityKwh: num("solarBattery"),
    startingRate: num("solarStartRate"),
    annualRateIncrease: pct("solarRateIncrease"),
    sellRate: num("solarSellRate"),
    sellRateDegradation: pct("solarSellDegradation"),
    annualDegradation: pct("solarDegradation"),
    annualUsageKwh: num("solarUsage"),
    years: Math.max(1, Math.round(num("solarYears"))),
  };
}

const kwh = (n: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} kWh`;

function yearsLabel(y: number): string {
  const whole = Math.floor(y);
  const months = Math.round((y - whole) * 12);
  if (months === 0) return `${whole} year${whole === 1 ? "" : "s"}`;
  return `${whole}y ${months}m`;
}

/* ── Readouts ─────────────────────────────────────────────── */
function renderReadouts(input: SolarInput, res: SolarResult, cur: Currency) {
  const paysBack = res.paybackYearExact !== null;
  $("solarPaybackValue").textContent = paysBack
    ? yearsLabel(res.paybackYearExact!)
    : "Never";
  $("solarPaybackSub").textContent = paysBack
    ? `breaks even during year ${res.paybackYear}`
    : `still ${money(-res.netPosition, cur)} down at year ${input.years}`;
  $("solarPaybackValue").classList.toggle("readout__value--cost", !paysBack);

  $("solarSavingsValue").textContent = money(res.firstYearSavings, cur);
  $("solarSavingsSub").textContent = `${kwh(res.annualGenerationKwh)} generated in year 1`;

  $("solarNetValue").textContent = money(res.netPosition, cur);
  $("solarNetValue").classList.toggle("readout__value--cost", res.netPosition < 0);
  $("solarNetSub").textContent = `after ${input.years} years, incl. ${money(
    input.systemCost,
    cur,
  )} system`;
}

/* ── Chart (SVG) ──────────────────────────────────────────── */
const W = 800;
const H = 400;
const PAD = { l: 64, r: 14, t: 12, b: 28 };

/** Round a magnitude up to 1/2/5 x 10^n so gridlines land on readable numbers. */
function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function renderChart(input: SolarInput, res: SolarResult, cur: Currency): void {
  const host = $("solarChart");

  // Year 0 is the up-front cost; the series runs 0..years.
  const pts: [number, number][] = [[0, -input.systemCost]];
  for (const r of res.rows) pts.push([r.year, r.cumulativeCashFlow]);

  // Cash flow spans negative to positive, so the domain is derived from the
  // data (not anchored at zero like the mortgage chart's balance).
  const values = pts.map((p) => p[1]);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const step = niceStep((rawMax - rawMin || 1) / 4);
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;
  const xMax = Math.max(input.years, 1);

  const px = (yr: number) => PAD.l + (yr / xMax) * (W - PAD.l - PAD.r);
  const py = (v: number) =>
    PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);

  const line = (p: [number, number][]) =>
    p
      .map((q, i) => `${i ? "L" : "M"}${px(q[0]).toFixed(1)} ${py(q[1]).toFixed(1)}`)
      .join(" ");

  const path = line(pts);
  // Fill between the curve and the zero line, so "in the red" reads visually.
  const zeroY = py(0);
  const area = `${path} L${px(pts[pts.length - 1][0]).toFixed(1)} ${zeroY.toFixed(
    1,
  )} L${px(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  let grid = "";
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    const y = py(v).toFixed(1);
    const isZero = Math.abs(v) < step / 1e6;
    grid += `<line class="${
      isZero ? "chart__zeroline" : "chart__gridline"
    }" x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" />`;
    // Snap to exact 0 at the zero line — float drift would render "-¥0".
    grid += `<text class="chart__axis-label" x="${PAD.l - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${moneyCompact(
      isZero ? 0 : v,
      cur,
    )}</text>`;
  }

  const yearStep = input.years <= 12 ? 2 : 5;
  for (let yr = 0; yr <= input.years; yr += yearStep) {
    grid += `<text class="chart__axis-label" x="${px(yr).toFixed(1)}" y="${
      H - 8
    }" text-anchor="middle">${yr}y</text>`;
  }

  // Payback marker: where the curve crosses zero.
  let marker = "";
  if (res.paybackYearExact !== null) {
    const x = px(res.paybackYearExact).toFixed(1);
    marker = `
      <line class="chart__payback" x1="${x}" y1="${PAD.t}" x2="${x}" y2="${H - PAD.b}" />
      <circle class="chart__payback-dot" cx="${x}" cy="${zeroY.toFixed(1)}" r="4" />`;
  }

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Cumulative cash flow climbing from the system cost to break even and beyond">
      <defs>
        <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--best)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--best)" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      ${grid}
      <path class="chart__area-solar" d="${area}" />
      <path class="chart__line-solar" d="${path}" />
      ${marker}
      <line class="chart__cursor" id="solarCursor" x1="0" y1="${PAD.t}" x2="0" y2="${
        H - PAD.b
      }" style="opacity:0" />
      <circle class="chart__dot chart__dot--solar" id="solarDot" r="4" cx="0" cy="0" style="opacity:0" />
      <rect id="solarHit" x="${PAD.l}" y="${PAD.t}" width="${W - PAD.l - PAD.r}" height="${
        H - PAD.t - PAD.b
      }" fill="transparent" />
    </svg>
    <div class="chart__tip" id="solarTip"></div>
  `;

  $("solarLegend").innerHTML =
    `<span class="key"><span class="swatch" style="background:var(--best)"></span>Cumulative cash flow</span>` +
    (res.paybackYearExact !== null
      ? `<span class="key"><span class="swatch swatch--line" style="background:var(--accent)"></span>Payback</span>`
      : "");

  wireHover(pts, res, cur, { px, py, xMax });
}

interface Scales {
  px: (yr: number) => number;
  py: (v: number) => number;
  xMax: number;
}

/** `pts` is indexed by year (0 = the up-front cost), matching the drawn series. */
function wireHover(
  pts: [number, number][],
  res: SolarResult,
  cur: Currency,
  s: Scales,
): void {
  const svg = $("solarChart").querySelector("svg")!;
  const hit = $("solarHit");
  const cursor = $("solarCursor");
  const dot = $("solarDot");
  const tip = $("solarTip");

  const move = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * W;
    const frac = Math.min(1, Math.max(0, (localX - PAD.l) / (W - PAD.l - PAD.r)));
    const year = Math.min(pts.length - 1, Math.max(0, Math.round(frac * s.xMax)));
    const row = res.rows[year - 1];
    const value = pts[year][1];

    const cx = s.px(year);
    const cy = s.py(value);
    cursor.setAttribute("x1", String(cx));
    cursor.setAttribute("x2", String(cx));
    cursor.style.opacity = "1";
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.style.opacity = "1";
    tip.style.left = `${(cx / W) * rect.width}px`;
    tip.style.top = `${(cy / H) * rect.height}px`;
    tip.classList.add("is-on");
    tip.innerHTML =
      year === 0
        ? `Year 0 · ${money(value, cur)}<br>system installed`
        : `Year ${year} · ${money(value, cur)}<br>saved ${money(
            row?.annualSavings ?? 0,
            cur,
          )} this year`;
  };

  hit.addEventListener("pointermove", (e) => move((e as PointerEvent).clientX));
  hit.addEventListener("pointerleave", () => {
    cursor.style.opacity = "0";
    dot.style.opacity = "0";
    tip.classList.remove("is-on");
  });
}

/* ── Table ────────────────────────────────────────────────── */
function renderTable(res: SolarResult, cur: Currency): void {
  const view = segmentValue("solarTableView"); // "cash" | "energy"
  const table = $("solarTable") as HTMLTableElement;
  const thead = table.querySelector("thead")!;
  const tbody = table.querySelector("tbody")!;

  const cols =
    view === "cash"
      ? ["Year", "Buy", "Sell", "Cost w/o solar", "Cost w/ solar", "Savings", "Cumulative"]
      : ["Year", "Generation", "Self-consumed", "Sold to grid", "Usage", "Savings"];
  thead.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;

  let body = "";
  for (const r of res.rows) {
    const paid = r.cumulativeCashFlow >= 0;
    body +=
      view === "cash"
        ? `<tr>
            <td>${r.year}</td>
            <td>${money(r.ratePerKwh, cur, 2)}</td>
            <td>${money(r.sellRatePerKwh, cur, 2)}</td>
            <td class="cell-cost">${money(r.costWithoutSolar, cur)}</td>
            <td class="${r.costWithSolar < 0 ? "cell-credit" : "cell-cost"}">${money(
              r.costWithSolar,
              cur,
            )}</td>
            <td class="cell-credit">${money(r.annualSavings, cur)}</td>
            <td class="${paid ? "cell-credit" : "cell-cost"}">${money(
              r.cumulativeCashFlow,
              cur,
            )}</td>
          </tr>`
        : `<tr>
            <td>${r.year}</td>
            <td>${kwh(r.generationKwh)}</td>
            <td>${kwh(r.selfConsumedKwh)}</td>
            <td>${kwh(r.soldKwh)}</td>
            <td>${kwh(r.usageKwh)}</td>
            <td class="cell-credit">${money(r.annualSavings, cur)}</td>
          </tr>`;
  }
  tbody.innerHTML = body;
}

/* ── Render + wiring ──────────────────────────────────────── */
export function renderSolar(): void {
  const input = readInput();
  const cur = currencyFrom("solarCurrency");
  const res = simulate(input);
  renderReadouts(input, res, cur);
  renderChart(input, res, cur);
  renderTable(res, cur);
}

export function initSolar(): void {
  const cost = $("solarSystemCost") as HTMLInputElement;
  cost.addEventListener("blur", () => {
    cost.value = new Intl.NumberFormat("en-US").format(parseNumber(cost.value));
    renderSolar();
  });

  $("solarControls").addEventListener("input", renderSolar);
  $("solarCurrency").addEventListener("change", renderSolar);
  wireSegment("solarTableView", renderSolar);

  renderSolar();
}

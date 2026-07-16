/** DOM, formatting, and control helpers shared by the mortgage and solar tabs. */

/* ── DOM ──────────────────────────────────────────────────── */
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/* ── Currency / formatting ────────────────────────────────── */
export interface Currency {
  symbol: string;
  locale: string;
}

/** Read a `symbol|locale` currency <select> (e.g. `¥|ja-JP`). */
export function currencyFrom(selectId: string): Currency {
  const [symbol, locale] = ($(selectId) as HTMLSelectElement).value.split("|");
  return { symbol: symbol === "none" ? "" : symbol, locale: locale || "en-US" };
}

/**
 * The symbol goes inside the sign — "-¥1,300,000", never "¥-1,300,000" — so
 * the solar tab's negative cash flow reads correctly. Formatting the magnitude
 * and re-attaching the sign keeps that true for every locale here.
 */
function signed(magnitude: string, n: number, cur: Currency): string {
  const sign = n < 0 ? "-" : "";
  return cur.symbol ? `${sign}${cur.symbol}${magnitude}` : `${sign}${magnitude}`;
}

export function money(n: number, cur: Currency, decimals = 0): string {
  const rounded = Math.round(Math.abs(n) * 10 ** decimals) / 10 ** decimals;
  const num = new Intl.NumberFormat(cur.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded);
  // -0 after rounding is still zero; don't render a stray minus.
  return signed(num, rounded === 0 ? 0 : n, cur);
}

export function moneyCompact(n: number, cur: Currency): string {
  const num = new Intl.NumberFormat(cur.locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.abs(n));
  return signed(num, n, cur);
}

export function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/* ── Segmented controls ───────────────────────────────────── */
export function segmentValue(id: string): string {
  const active = $(id).querySelector<HTMLButtonElement>(".is-active");
  return active?.dataset.value ?? "";
}

export function wireSegment(id: string, onChange: () => void): void {
  const group = $(id);
  group.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      ".segmented__btn",
    );
    if (!btn || btn.classList.contains("is-active")) return;
    group
      .querySelectorAll(".segmented__btn")
      .forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    onChange();
  });
}

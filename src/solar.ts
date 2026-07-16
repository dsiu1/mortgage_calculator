/**
 * Core solar payback math — framework-free and fully unit-tested.
 *
 * Ports the reference Google Sheet's "Solar Simulation" tab, one row per year,
 * with year 0 holding the up-front system cost:
 *
 *   buyRate_n     = startingRate * (1 + annualRateIncrease)^(n-1)
 *   sellRate_n    = sellRate * (1 - sellRateDegradation)^(n-1)
 *   generation_n  = annualGeneration * (1 - annualDegradation)^(n-1)
 *   selfConsumed  = MIN(usage, generation_n)
 *   sold          = MAX(0, generation_n - selfConsumed)
 *   costWithout   = buyRate_n * usage
 *   costWith      = (usage - selfConsumed) * buyRate_n - sold * sellRate_n
 *   savings_n     = costWithout - costWith
 *   cumulative_n  = cumulative_(n-1) + savings_n,  cumulative_0 = -systemCost
 *
 * Two deliberate departures from the sheet:
 *  - The sheet clipped self-consumption at `generation * 0.8`, a ratio input
 *    that is now gone: generation is used on site up to usage, and
 *    only the true surplus is sold. For the sheet's own assumptions this is a
 *    no-op — 6480 * 0.8 = 5184 still exceeded the 4100 kWh usage, so the MIN
 *    clipped at usage either way, and the tests still reconcile row-for-row.
 *    It only diverges for systems too small to cover usage.
 *  - The sheet held the sell rate flat while inflating the buy rate.
 *    `sellRateDegradation` lets the export tariff decay on its own curve; at
 *    its 0 default the sell rate stays flat and the sheet's numbers hold.
 */

/** Annual kWh produced per kW of installed capacity (sheet: `= capacity * 1200`). */
export const KWH_PER_KW_YEAR = 1200;

export interface SolarInput {
  /** Up-front installed cost, in whole currency units. */
  systemCost: number;
  /** Installed panel capacity, kW. */
  solarCapacityKw: number;
  /**
   * Installed battery capacity, kWh. Carried for the record: the sheet lists it
   * as an assumption but no formula reads it. Storage is what makes using
   * generation on site plausible, but the model assumes that outright rather
   * than sizing it — deliberately not wired into the math.
   */
  batteryCapacityKwh?: number;
  /** Grid price paid per kWh in year 1. */
  startingRate: number;
  /** Buy-rate inflation per year, as a fraction (0.015 = 1.5%/yr). */
  annualRateIncrease: number;
  /** Price received per kWh exported to the grid, in year 1. */
  sellRate: number;
  /** Sell-rate decline per year, as a fraction (0.02 = 2%/yr). */
  sellRateDegradation: number;
  /** Panel output lost per year, as a fraction (0.005 = 0.5%/yr). */
  annualDegradation: number;
  /** Household consumption per year, kWh. Held flat across the horizon. */
  annualUsageKwh: number;
  /** Horizon in whole years (sheet: 20). */
  years: number;
}

export interface SolarRow {
  /** 1-based year. */
  year: number;
  /** Grid price paid this year, per kWh. */
  ratePerKwh: number;
  /** Export price received this year, per kWh. */
  sellRatePerKwh: number;
  usageKwh: number;
  costWithoutSolar: number;
  generationKwh: number;
  selfConsumedKwh: number;
  soldKwh: number;
  /** Net grid bill with solar — negative means the export credit exceeds the bill. */
  costWithSolar: number;
  annualSavings: number;
  /** Running total, starting from -systemCost. */
  cumulativeCashFlow: number;
}

export interface SolarResult {
  rows: SolarRow[];
  /** Year-1 output before degradation, kWh. */
  annualGenerationKwh: number;
  /** Sum of every year's savings (excludes the system cost). */
  totalSavings: number;
  /** Cumulative cash flow at the end of the horizon (includes the system cost). */
  netPosition: number;
  /** First whole year the cumulative cash flow is non-negative; null if never. */
  paybackYear: number | null;
  /**
   * Payback interpolated within the crossing year (e.g. 8.29), assuming savings
   * accrue evenly across that year. Null if the system never pays back.
   */
  paybackYearExact: number | null;
  firstYearSavings: number;
}

/** Year-1 generation implied by the installed capacity. */
export function annualGeneration(solarCapacityKw: number): number {
  return solarCapacityKw * KWH_PER_KW_YEAR;
}

/** Run the year-by-year simulation. */
export function simulate(input: SolarInput): SolarResult {
  const years = Math.max(1, Math.round(input.years));
  const gen1 = annualGeneration(input.solarCapacityKw);
  const rows: SolarRow[] = [];

  let cumulative = -input.systemCost;
  let totalSavings = 0;
  let paybackYear: number | null = null;
  let paybackYearExact: number | null = null;

  for (let year = 1; year <= years; year++) {
    const ratePerKwh =
      input.startingRate * Math.pow(1 + input.annualRateIncrease, year - 1);
    const sellRatePerKwh =
      input.sellRate * Math.pow(1 - input.sellRateDegradation, year - 1);
    const generationKwh = gen1 * Math.pow(1 - input.annualDegradation, year - 1);
    const usageKwh = input.annualUsageKwh;

    const costWithoutSolar = ratePerKwh * usageKwh;
    const selfConsumedKwh = Math.min(usageKwh, generationKwh);
    const soldKwh = Math.max(0, generationKwh - selfConsumedKwh);
    const costWithSolar =
      (usageKwh - selfConsumedKwh) * ratePerKwh - soldKwh * sellRatePerKwh;
    const annualSavings = costWithoutSolar - costWithSolar;

    const previous = cumulative;
    cumulative += annualSavings;
    totalSavings += annualSavings;

    if (paybackYear === null && cumulative >= 0) {
      paybackYear = year;
      // Straight-line within the crossing year: how far in did it break even?
      paybackYearExact =
        annualSavings > 0 ? year - 1 + -previous / annualSavings : year;
    }

    rows.push({
      year,
      ratePerKwh,
      sellRatePerKwh,
      usageKwh,
      costWithoutSolar,
      generationKwh,
      selfConsumedKwh,
      soldKwh,
      costWithSolar,
      annualSavings,
      cumulativeCashFlow: cumulative,
    });
  }

  return {
    rows,
    annualGenerationKwh: gen1,
    totalSavings,
    netPosition: cumulative,
    paybackYear,
    paybackYearExact,
    firstYearSavings: rows[0]?.annualSavings ?? 0,
  };
}

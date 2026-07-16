import { describe, expect, test } from "vitest";
import { annualGeneration, simulate, type SolarInput } from "./solar";

/**
 * The reference sheet's "Solar Simulation" assumptions (B2:B11).
 *
 * The sheet's self-consumption ratio (0.8) has no equivalent input any more,
 * and its sell rate was flat — `sellRateDegradation: 0` reproduces that. Both
 * rows below still match the sheet exactly, which is the point of pinning them.
 */
const SHEET: SolarInput = {
  systemCost: 1_300_000,
  solarCapacityKw: 5.4,
  batteryCapacityKwh: 9.9,
  startingRate: 32,
  annualRateIncrease: 0.015,
  sellRate: 8,
  sellRateDegradation: 0,
  annualDegradation: 0.005,
  annualUsageKwh: 4100,
  years: 20,
};

describe("annualGeneration", () => {
  test("matches the sheet's `= capacity * 1200`", () => {
    expect(annualGeneration(5.4)).toBeCloseTo(6480, 6);
  });
});

describe("simulate — row 1 against the sheet (row 15)", () => {
  const r = simulate(SHEET).rows[0];

  test("rate starts un-inflated", () => expect(r.ratePerKwh).toBeCloseTo(32, 6));
  test("generation starts un-degraded", () =>
    expect(r.generationKwh).toBeCloseTo(6480, 6));
  test("cost without solar", () =>
    expect(r.costWithoutSolar).toBeCloseTo(131_200, 4));
  test("self-consumption is clipped at usage", () =>
    expect(r.selfConsumedKwh).toBeCloseTo(4100, 6));
  test("surplus sold is generation minus self-consumed", () =>
    expect(r.soldKwh).toBeCloseTo(2380, 6));
  test("sell rate starts un-degraded", () =>
    expect(r.sellRatePerKwh).toBeCloseTo(8, 6));
  test("cost with solar goes negative on export credit", () =>
    expect(r.costWithSolar).toBeCloseTo(-19_040, 4));
  test("annual savings", () => expect(r.annualSavings).toBeCloseTo(150_240, 4));
  test("cumulative cash flow after year 1", () =>
    expect(r.cumulativeCashFlow).toBeCloseTo(-1_149_760, 4));
});

describe("simulate — later rows against the sheet", () => {
  const rows = simulate(SHEET).rows;

  test("year 2 (sheet row 16)", () => {
    const r = rows[1];
    expect(r.ratePerKwh).toBeCloseTo(32.48, 6);
    expect(r.generationKwh).toBeCloseTo(6447.6, 4);
    expect(r.costWithoutSolar).toBeCloseTo(133_168, 4);
    expect(r.soldKwh).toBeCloseTo(2347.6, 4);
    expect(r.costWithSolar).toBeCloseTo(-18_780.8, 4);
    expect(r.annualSavings).toBeCloseTo(151_948.8, 4);
    expect(r.cumulativeCashFlow).toBeCloseTo(-997_811.2, 4);
  });

  test("year 10 (sheet row 24)", () => {
    const r = rows[9];
    expect(r.ratePerKwh).toBeCloseTo(36.58847921, 6);
    expect(r.generationKwh).toBeCloseTo(6194.164468, 4);
    expect(r.costWithoutSolar).toBeCloseTo(150_012.7648, 3);
    expect(r.annualSavings).toBeCloseTo(166_766.0805, 3);
    expect(r.cumulativeCashFlow).toBeCloseTo(283_087.2502, 3);
  });

  test("year 20 (sheet row 34) closes the horizon", () => {
    const r = rows[19];
    expect(rows).toHaveLength(20);
    expect(r.ratePerKwh).toBeCloseTo(42.46242385, 6);
    expect(r.generationKwh).toBeCloseTo(5891.332575, 4);
    expect(r.costWithoutSolar).toBeCloseTo(174_095.9378, 3);
    expect(r.annualSavings).toBeCloseTo(188_426.5984, 3);
    expect(r.cumulativeCashFlow).toBeCloseTo(2_066_823.664, 3);
  });
});

describe("simulate — headline figures", () => {
  const res = simulate(SHEET);

  test("net position equals the last row's cumulative", () => {
    expect(res.netPosition).toBeCloseTo(2_066_823.664, 3);
  });

  test("total savings excludes the system cost", () => {
    expect(res.totalSavings).toBeCloseTo(2_066_823.664 + 1_300_000, 3);
  });

  test("payback lands in year 9 — the sheet flips sign between rows 22 and 23", () => {
    expect(res.paybackYear).toBe(9);
    // year 8 ends at -48,476.985; year 9 saves 164,798.155
    expect(res.paybackYearExact).toBeCloseTo(8 + 48_476.985 / 164_798.155, 3);
  });

  test("first-year savings", () => {
    expect(res.firstYearSavings).toBeCloseTo(150_240, 4);
  });
});

describe("simulate — edges", () => {
  test("a system that never pays back reports no payback", () => {
    const res = simulate({ ...SHEET, systemCost: 500_000_000 });
    expect(res.paybackYear).toBeNull();
    expect(res.paybackYearExact).toBeNull();
    expect(res.netPosition).toBeLessThan(0);
  });

  test("a free system pays back in year 1", () => {
    const res = simulate({ ...SHEET, systemCost: 0 });
    expect(res.paybackYear).toBe(1);
  });

  test("no panels means no savings and the cost never returns", () => {
    const res = simulate({ ...SHEET, solarCapacityKw: 0 });
    expect(res.rows[0].annualSavings).toBeCloseTo(0, 6);
    expect(res.netPosition).toBeCloseTo(-1_300_000, 6);
  });

  test("a system too small to cover usage sells nothing", () => {
    // 1 kW => 1200 kWh/yr, all of it used on site against 4100 kWh of usage.
    const res = simulate({ ...SHEET, solarCapacityKw: 1 });
    expect(res.rows[0].selfConsumedKwh).toBeCloseTo(1200, 6);
    expect(res.rows[0].soldKwh).toBeCloseTo(0, 6);
    // Savings are then just the grid power displaced: 1200 kWh * ¥32.
    expect(res.rows[0].annualSavings).toBeCloseTo(38_400, 4);
  });

  test("horizon is honoured", () => {
    expect(simulate({ ...SHEET, years: 5 }).rows).toHaveLength(5);
  });
});

describe("simulate — sell rate decays on its own curve", () => {
  const DECAY: SolarInput = { ...SHEET, sellRateDegradation: 0.02 };

  test("year 1 is unaffected", () => {
    expect(simulate(DECAY).rows[0].sellRatePerKwh).toBeCloseTo(8, 6);
  });

  test("year 2 drops by the degradation, while the buy rate still inflates", () => {
    const r = simulate(DECAY).rows[1];
    expect(r.sellRatePerKwh).toBeCloseTo(8 * 0.98, 6); // 7.84
    expect(r.ratePerKwh).toBeCloseTo(32.48, 6); // buy rate untouched
  });

  test("year 20 compounds the decline", () => {
    expect(simulate(DECAY).rows[19].sellRatePerKwh).toBeCloseTo(
      8 * 0.98 ** 19,
      6,
    );
  });

  test("a decaying export tariff pays back later than a flat one", () => {
    const flat = simulate(SHEET);
    const decayed = simulate(DECAY);
    expect(decayed.netPosition).toBeLessThan(flat.netPosition);
    expect(decayed.paybackYearExact!).toBeGreaterThan(flat.paybackYearExact!);
  });

  test("degradation is irrelevant when nothing is exported", () => {
    // 1 kW generates less than usage, so no export — the sell rate can't matter.
    const small = { ...SHEET, solarCapacityKw: 1 };
    expect(simulate(small).netPosition).toBeCloseTo(
      simulate({ ...small, sellRateDegradation: 0.5 }).netPosition,
      6,
    );
  });
});

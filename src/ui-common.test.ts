import { describe, expect, test } from "vitest";
import { money, moneyCompact, type Currency } from "./ui-common";

const YEN: Currency = { symbol: "¥", locale: "ja-JP" };
const PLAIN: Currency = { symbol: "", locale: "en-US" };

describe("money", () => {
  test("prefixes the symbol", () => {
    expect(money(1_300_000, YEN)).toBe("¥1,300,000");
  });

  test("puts the minus outside the symbol", () => {
    expect(money(-1_149_760, YEN)).toBe("-¥1,149,760");
  });

  test("honours decimals for per-kWh rates", () => {
    expect(money(32.48, YEN, 2)).toBe("¥32.48");
  });

  test("a symbol-less currency still signs correctly", () => {
    expect(money(-2500, PLAIN)).toBe("-2,500");
  });

  test("values rounding to zero render without a minus", () => {
    expect(money(-0.2, YEN)).toBe("¥0");
    expect(money(0, YEN)).toBe("¥0");
  });
});

describe("moneyCompact", () => {
  test("compacts positives (ja-JP groups by 万 = 10k)", () => {
    expect(moneyCompact(2_066_824, YEN)).toBe("¥206.7万");
  });

  test("puts the minus outside the symbol", () => {
    expect(moneyCompact(-1_300_000, YEN)).toBe("-¥130万");
  });

  test("zero has no sign", () => {
    expect(moneyCompact(0, YEN)).toBe("¥0");
  });
});

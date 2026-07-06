import { describe, expect, it } from "vitest";
import { formatCurrency, formatMoney, formatPercent } from "../format";

describe("format utils", () => {
  it("formats minor-unit currency to shekels", () => {
    expect(formatCurrency(15000, "ILS")).toContain("₪");
    expect(formatCurrency(15000, "ILS")).toContain("150");
    expect(formatCurrency(null)).toBe("—");
  });

  it("formats major-unit money", () => {
    expect(formatMoney(37.27, "ILS")).toContain("37.27");
    expect(formatMoney(undefined)).toBe("—");
  });

  it("formats percent", () => {
    expect(formatPercent(1.78)).toContain("1.78");
    expect(formatPercent(null)).toBe("—");
  });
});

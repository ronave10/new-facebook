const CURRENCY_SYMBOLS: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

/** Money is stored in minor units (agorot/cents). */
export function formatCurrency(minorUnits: number | null | undefined, currency = "ILS"): string {
  if (minorUnits === null || minorUnits === undefined) return "—";
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const value = minorUnits / 100;
  return `${symbol}${value.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

/** For values already in major units (e.g. computed CPL). */
export function formatMoney(value: number | null | undefined, currency = "ILS"): string {
  if (value === null || value === undefined) return "—";
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("he-IL");
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

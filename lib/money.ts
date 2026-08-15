// Money is stored everywhere as integer cents to avoid floating-point errors.
// Convention: positive cents = money IN (income), negative = money OUT (spending).

/** Parse a human/CSV amount string like "-1,234.56" or "$88.40" into cents. */
export function parseAmountToCents(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;

  // Handle parentheses as negative, e.g. "(42.17)" => -42.17
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Strip currency symbols, thousands separators, and spaces.
  s = s.replace(/[$,\s]/g, "");

  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) return null;

  const value = Number(s);
  if (!Number.isFinite(value)) return null;

  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Format integer cents as a display string, e.g. -4217 => "-$42.17". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  const withCommas = dollars.toLocaleString("en-US");
  return `${sign}$${withCommas}.${remainder}`;
}

import crypto from "crypto";

// Parsing helpers shared by all CSV bank presets.

/**
 * Parse a date string in the common formats banks export.
 * Supports: YYYY-MM-DD, MM/DD/YYYY, M/D/YY, DD-MMM-YYYY (e.g. 10-Aug-2026).
 * Returns a Date at UTC midnight, or null if unrecognized.
 */
export function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();

  // ISO: YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utc(+m[1], +m[2], +m[3]);

  // US: MM/DD/YYYY or M/D/YY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return utc(year, +m[1], +m[2]);
  }

  // DD-MMM-YYYY, e.g. 10-Aug-2026
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return utc(+m[3], month, +m[1]);
  }

  // Fallback: let the JS engine try.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Stable fingerprint for de-duplicating transactions on re-import.
 * Same date + amount + description within an account = same transaction.
 */
export function dedupeHash(
  date: Date,
  amountCents: number,
  description: string
): string {
  const key = [
    date.toISOString().slice(0, 10),
    amountCents,
    description.trim().toLowerCase().replace(/\s+/g, " "),
  ].join("|");
  return crypto.createHash("sha1").update(key).digest("hex");
}

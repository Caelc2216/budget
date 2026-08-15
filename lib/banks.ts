import { parseAmountToCents } from "./money";

// A parsed, normalized row ready to become a Transaction.
export interface NormalizedRow {
  date: string; // raw date string
  description: string;
  amountCents: number; // negative = spending, positive = income
}

// Column-name hints. Bank exports vary, so we match headers fuzzily by these.
const DATE_HEADERS = ["date", "post date", "posted date", "transaction date", "posting date"];
const DESC_HEADERS = ["description", "memo", "name", "payee", "merchant", "transaction"];
const AMOUNT_HEADERS = ["amount", "transaction amount"];
const DEBIT_HEADERS = ["debit", "withdrawal", "withdrawals", "money out"];
const CREDIT_HEADERS = ["credit", "deposit", "deposits", "money in"];

export interface BankPreset {
  id: string;
  label: string;
  // If the bank reports spending as a POSITIVE number in a single amount
  // column, set this so we flip the sign to our convention (negative = spend).
  amountIsPositiveSpend?: boolean;
}

export const BANK_PRESETS: BankPreset[] = [
  { id: "auto", label: "Auto-detect columns" },
  { id: "america-first", label: "America First Credit Union" },
  { id: "mountain-america", label: "Mountain America Credit Union" },
];

function findHeader(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  // Exact match first, then substring.
  for (const cand of candidates) {
    const i = lower.indexOf(cand);
    if (i !== -1) return headers[i];
  }
  for (const cand of candidates) {
    const i = lower.findIndex((h) => h.includes(cand));
    if (i !== -1) return headers[i];
  }
  return null;
}

export interface ColumnMap {
  dateKey: string;
  descKey: string;
  amountKey?: string;
  debitKey?: string;
  creditKey?: string;
}

/** Inspect the CSV header row and figure out which columns to use. */
export function detectColumns(headers: string[]): ColumnMap | null {
  const dateKey = findHeader(headers, DATE_HEADERS);
  const descKey = findHeader(headers, DESC_HEADERS);
  if (!dateKey || !descKey) return null;

  const amountKey = findHeader(headers, AMOUNT_HEADERS);
  const debitKey = findHeader(headers, DEBIT_HEADERS);
  const creditKey = findHeader(headers, CREDIT_HEADERS);

  if (!amountKey && !debitKey && !creditKey) return null;

  return {
    dateKey,
    descKey,
    amountKey: amountKey ?? undefined,
    debitKey: debitKey ?? undefined,
    creditKey: creditKey ?? undefined,
  };
}

/**
 * Convert one raw CSV record into a normalized row using the column map.
 * Handles both single-amount and split debit/credit layouts.
 */
export function normalizeRow(
  record: Record<string, string>,
  cols: ColumnMap,
  preset: BankPreset
): NormalizedRow | null {
  const date = (record[cols.dateKey] ?? "").trim();
  const description = (record[cols.descKey] ?? "").trim();
  if (!date || !description) return null;

  let amountCents: number | null = null;

  if (cols.debitKey || cols.creditKey) {
    // Split layout: debit is money out, credit is money in.
    const debit = cols.debitKey ? parseAmountToCents(record[cols.debitKey]) : null;
    const credit = cols.creditKey ? parseAmountToCents(record[cols.creditKey]) : null;
    if (debit && debit !== 0) amountCents = -Math.abs(debit);
    else if (credit && credit !== 0) amountCents = Math.abs(credit);
    else amountCents = 0;
  } else if (cols.amountKey) {
    const parsed = parseAmountToCents(record[cols.amountKey]);
    if (parsed === null) return null;
    amountCents = preset.amountIsPositiveSpend ? -parsed : parsed;
  }

  if (amountCents === null) return null;
  return { date, description, amountCents };
}

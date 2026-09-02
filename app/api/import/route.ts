import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { parseDate, dedupeHash } from "@/lib/csv";
import { categorize } from "@/lib/categorize";
import {
  BANK_PRESETS,
  detectColumns,
  normalizeRow,
  type BankPreset,
} from "@/lib/banks";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const accountId = form.get("accountId");
  const presetId = (form.get("preset") as string) || "auto";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (typeof accountId !== "string" || !accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const preset: BankPreset =
    BANK_PRESETS.find((p) => p.id === presetId) ?? BANK_PRESETS[0];

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    return NextResponse.json(
      { error: "Could not read a header row from this CSV." },
      { status: 422 }
    );
  }

  const cols = detectColumns(parsed.meta.fields);
  if (!cols) {
    return NextResponse.json(
      {
        error:
          "Could not identify Date, Description, and Amount columns. " +
          `Found columns: ${parsed.meta.fields.join(", ")}`,
      },
      { status: 422 }
    );
  }

  const rows = parsed.data;
  let imported = 0;
  let skipped = 0;

  // Create the import batch first so imported rows can reference it.
  const batch = await prisma.importBatch.create({
    data: {
      accountId,
      filename: file.name,
      rowCount: rows.length,
      importedCount: 0,
      skippedCount: 0,
    },
  });

  for (const record of rows) {
    const normalized = normalizeRow(record, cols, preset, account.type);
    if (!normalized) {
      skipped++;
      continue;
    }
    const date = parseDate(normalized.date);
    if (!date) {
      skipped++;
      continue;
    }

    const hash = dedupeHash(date, normalized.amountCents, normalized.description);

    // The dedupeHash above only catches an exact re-import of this same CSV
    // (same description text) — CSV-vs-CSV dedup already relies on that
    // description match to tell apart two legitimate same-day, same-amount
    // rows. It can't catch the same real-world transaction already present
    // from another source (e.g. Plaid), since a bank's CSV description
    // rarely matches Plaid's cleaned-up merchant name. Guard against that
    // separately, scoped to non-CSV sources only: same account + same day +
    // same amount already synced from Plaid/Teller/manual entry is almost
    // certainly the same transaction.
    const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const crossSourceDupe = await prisma.transaction.findFirst({
      where: {
        accountId,
        amountCents: normalized.amountCents,
        date: { gte: dayStart, lt: dayEnd },
        source: { not: "csv" },
      },
      select: { id: true },
    });
    if (crossSourceDupe) {
      skipped++;
      continue;
    }

    const categoryId = await categorize(
      normalized.description,
      normalized.amountCents
    );

    try {
      await prisma.transaction.create({
        data: {
          accountId,
          date,
          description: normalized.description,
          merchant: normalized.description,
          amountCents: normalized.amountCents,
          categoryId,
          source: "csv",
          dedupeHash: hash,
          importBatchId: batch.id,
        },
      });
      imported++;
    } catch (e: unknown) {
      // Unique constraint violation on (accountId, dedupeHash) => duplicate.
      skipped++;
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { importedCount: imported, skippedCount: skipped },
  });

  return NextResponse.json({
    batchId: batch.id,
    detectedColumns: cols,
    rowCount: rows.length,
    imported,
    skipped,
  });
}

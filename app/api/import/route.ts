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

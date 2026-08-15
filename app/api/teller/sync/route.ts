import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tellerConfigured, tellerEnvironment } from "@/lib/teller";
import { syncAllTeller } from "@/lib/tellerSync";

// GET /api/teller/sync — status for the UI.
export async function GET() {
  const enrollments = await prisma.tellerEnrollment.count();
  return NextResponse.json({
    configured: tellerConfigured(),
    environment: tellerEnvironment(),
    applicationId: process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID ?? null,
    enrollments,
  });
}

// POST /api/teller/sync — pull latest from all Teller enrollments.
export async function POST() {
  try {
    const results = await syncAllTeller();
    const totals = results.reduce(
      (a, r) => ({ added: a.added + r.added, updated: a.updated + r.updated }),
      { added: 0, updated: 0 }
    );
    return NextResponse.json({ enrollments: results.length, ...totals, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tellerGet, type TellerAccount } from "@/lib/teller";
import { syncEnrollment } from "@/lib/tellerSync";

// POST /api/teller/enroll
// Body from Teller Connect onSuccess: { accessToken, enrollmentId, institution }
// Stores the enrollment, creates an Account per Teller account, initial sync.
export async function POST(req: NextRequest) {
  const { accessToken, enrollmentId, institution } = await req.json();
  if (!accessToken || !enrollmentId) {
    return NextResponse.json(
      { error: "accessToken and enrollmentId are required" },
      { status: 400 }
    );
  }

  // Verify the token works and discover accounts.
  let accounts: TellerAccount[];
  try {
    accounts = await tellerGet<TellerAccount[]>("/accounts", accessToken);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach Teller" },
      { status: 502 }
    );
  }

  const institutionName =
    institution || accounts[0]?.institution?.name || "Bank";

  await prisma.tellerEnrollment.upsert({
    where: { enrollmentId },
    update: { accessToken, institutionName },
    create: { enrollmentId, accessToken, institutionName },
  });

  for (const ta of accounts) {
    const type =
      ta.type === "credit" || ta.subtype === "credit_card"
        ? "credit"
        : ta.subtype === "savings"
        ? "savings"
        : "checking";
    const existing = await prisma.account.findFirst({
      where: { tellerAccountId: ta.id },
    });
    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { tellerEnrollmentId: enrollmentId, mask: ta.last_four ?? existing.mask },
      });
    } else {
      await prisma.account.create({
        data: {
          name: ta.name || "Account",
          institution: ta.institution?.name || institutionName,
          type,
          mask: ta.last_four ?? null,
          tellerEnrollmentId: enrollmentId,
          tellerAccountId: ta.id,
        },
      });
    }
  }

  const sync = await syncEnrollment(enrollmentId);

  return NextResponse.json({
    enrollmentId,
    institution: institutionName,
    accounts: accounts.map((a) => ({ name: a.name, last_four: a.last_four })),
    sync,
  });
}

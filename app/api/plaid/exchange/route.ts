import { NextRequest, NextResponse } from "next/server";
import { CountryCode } from "plaid";
import { getPlaidClient, plaidConfigured } from "@/lib/plaid";
import { prisma } from "@/lib/db";
import { syncItem } from "@/lib/plaidSync";

// POST /api/plaid/exchange
// Body: { public_token }
// Exchanges the public_token for an access_token, stores the item, creates an
// Account row per Plaid account, then does an initial sync.
export async function POST(req: NextRequest) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid not configured." }, { status: 501 });
  }
  const { public_token } = await req.json();
  if (!public_token) {
    return NextResponse.json({ error: "public_token required" }, { status: 400 });
  }

  const client = getPlaidClient();

  const exchange = await client.itemPublicTokenExchange({ public_token });
  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;

  // Look up institution + accounts for nice names.
  const accountsRes = await client.accountsGet({ access_token: accessToken });
  const plaidAccounts = accountsRes.data.accounts;
  const institutionId = accountsRes.data.item.institution_id;

  let institutionName: string | null = null;
  if (institutionId) {
    try {
      const inst = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = inst.data.institution.name;
    } catch {
      institutionName = null;
    }
  }

  await prisma.plaidItem.upsert({
    where: { itemId },
    update: { accessToken, institutionName },
    create: { itemId, accessToken, institutionName },
  });

  // Create/attach an Account for each Plaid account under this item.
  for (const pa of plaidAccounts) {
    const existing = await prisma.account.findFirst({
      where: { plaidAccountId: pa.account_id },
    });
    const type =
      pa.type === "credit"
        ? "credit"
        : pa.subtype === "savings"
        ? "savings"
        : "checking";
    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { plaidItemId: itemId, mask: pa.mask ?? existing.mask },
      });
    } else {
      await prisma.account.create({
        data: {
          name: pa.name || pa.official_name || "Account",
          institution: institutionName || "Bank",
          type,
          mask: pa.mask ?? null,
          plaidItemId: itemId,
          plaidAccountId: pa.account_id,
        },
      });
    }
  }

  // Initial pull so data shows up immediately.
  const result = await syncItem(itemId);

  return NextResponse.json({
    itemId,
    institution: institutionName,
    accounts: plaidAccounts.length,
    sync: result,
  });
}

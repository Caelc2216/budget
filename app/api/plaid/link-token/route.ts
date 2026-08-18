import { NextRequest, NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaidClient, plaidConfigured } from "@/lib/plaid";
import { prisma } from "@/lib/db";

// POST /api/plaid/link-token — mint a short-lived link_token for Plaid Link.
// Body: { itemId? } — when set, opens Link in "update mode" for that existing
// item instead of linking a new bank (used to fix ITEM_LOGIN_REQUIRED errors;
// the item's access_token stays the same, so no re-exchange is needed after).
export async function POST(req: NextRequest) {
  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid not configured. See PLAID.md." },
      { status: 501 }
    );
  }
  const { itemId } = await req.json().catch(() => ({ itemId: undefined }));
  const client = getPlaidClient();
  const webhook = process.env.PLAID_WEBHOOK_URL;

  try {
    let accessToken: string | undefined;
    if (itemId) {
      const item = await prisma.plaidItem.findUnique({ where: { itemId } });
      if (!item) {
        return NextResponse.json({ error: "Unknown Plaid item." }, { status: 404 });
      }
      accessToken = item.accessToken;
    }

    const res = await client.linkTokenCreate({
      user: { client_user_id: "budget-local-user" },
      client_name: "Budget",
      country_codes: [CountryCode.Us],
      language: "en",
      // Update mode: pass access_token instead of products, and Plaid Link
      // walks the user through re-authenticating just that one item.
      ...(accessToken
        ? { access_token: accessToken }
        : { products: [Products.Transactions] }),
      // Registering a webhook here is what enables push updates.
      ...(webhook ? { webhook } : {}),
    });
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (e: unknown) {
    // Surface Plaid's actual error so the UI (and logs) show what's wrong.
    const err = e as {
      response?: { data?: { error_code?: string; error_message?: string; error_type?: string } };
    };
    const data = err.response?.data;
    console.error("Plaid linkTokenCreate failed:", data ?? e);
    return NextResponse.json(
      {
        error:
          data?.error_message ||
          "Plaid rejected the link-token request.",
        error_code: data?.error_code,
        error_type: data?.error_type,
      },
      { status: 400 }
    );
  }
}

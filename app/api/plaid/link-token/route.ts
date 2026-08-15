import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaidClient, plaidConfigured } from "@/lib/plaid";

// POST /api/plaid/link-token — mint a short-lived link_token for Plaid Link.
export async function POST() {
  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid not configured. See PLAID.md." },
      { status: 501 }
    );
  }
  const client = getPlaidClient();
  const webhook = process.env.PLAID_WEBHOOK_URL;

  try {
    const res = await client.linkTokenCreate({
      user: { client_user_id: "budget-local-user" },
      client_name: "Budget",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
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

import https from "https";
import fs from "fs";

// Teller API client. Auth is HTTP Basic with the enrollment access_token as the
// username (empty password). In development/production, Teller also requires a
// client TLS certificate (mTLS); in sandbox it's not needed.

const TELLER_HOST = "api.teller.io";

export function tellerConfigured(): boolean {
  // Enrollment is what actually enables API use; the app-id is only needed by
  // the Connect widget. Consider Teller "available" if an app id is present.
  return Boolean(
    process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID || process.env.TELLER_APPLICATION_ID
  );
}

export function tellerEnvironment(): string {
  return process.env.TELLER_ENVIRONMENT || "sandbox";
}

// Load the client certificate + key for mTLS, if configured. Returns undefined
// in sandbox (or when not set), where mTLS isn't required.
function clientTls(): { cert: Buffer; key: Buffer } | undefined {
  const certPath = process.env.TELLER_CERT_PATH;
  const keyPath = process.env.TELLER_KEY_PATH;
  if (!certPath || !keyPath) return undefined;
  try {
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  } catch (e) {
    throw new Error(
      `Could not read Teller certificate/key (TELLER_CERT_PATH / TELLER_KEY_PATH): ${
        e instanceof Error ? e.message : e
      }`
    );
  }
}

/**
 * GET a Teller API path, authenticated with an enrollment access token.
 * Returns parsed JSON, or throws on non-2xx.
 */
export function tellerGet<T = unknown>(
  path: string,
  accessToken: string
): Promise<T> {
  const tls = clientTls();
  const auth = Buffer.from(`${accessToken}:`).toString("base64");

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: TELLER_HOST,
        path,
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
        ...(tls ? { cert: tls.cert, key: tls.key } : {}),
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Teller ${path} → HTTP ${status}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error(`Teller ${path}: invalid JSON response`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// Minimal shapes of the Teller responses we use.
export interface TellerAccount {
  id: string;
  name: string;
  type: string; // depository | credit
  subtype?: string; // checking | savings | credit_card | ...
  last_four?: string;
  institution?: { id?: string; name?: string };
}
export interface TellerTransaction {
  id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // signed decimal string; negative = outflow (spending)
  status?: string; // posted | pending
  details?: { counterparty?: { name?: string } };
}

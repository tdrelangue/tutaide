import { isServerMode } from "./deployment";

/**
 * Licence of a self-hosted organisation server: the key from its .env is
 * checked against OrigAI (tutaide.vercel.app) at most every 6 hours.
 *
 * - "valid" / "invalid": OrigAI answered.
 * - "unknown": OrigAI could not be reached — the server keeps working
 *   (an internal network or an outage must never stop the organisation).
 * An invalid licence only shows a banner; it never locks anyone out of the
 * protected persons' files (enforcement is a commercial decision, not built).
 */

export type LicenseStatus = "valid" | "invalid" | "unknown" | "not-applicable";

const CHECK_URL = `${process.env.BILLING_API_URL ?? "https://tutaide.vercel.app/api/billing"}/license`;
const CACHE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

type Cached = { status: LicenseStatus; at: number };
const holder = globalThis as unknown as { __tutelliaLicense?: Cached };

async function checkRemote(key: string): Promise<LicenseStatus> {
  try {
    const response = await fetch(CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "unknown";
    const body: unknown = await response.json();
    const valid = typeof body === "object" && body !== null && Reflect.get(body, "valid") === true;
    return valid ? "valid" : "invalid";
  } catch {
    return "unknown";
  }
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  if (!isServerMode()) return "not-applicable";
  const key = process.env.TUTELLIA_LICENSE_KEY ?? "";
  if (!/^[a-f0-9]{64}$/.test(key)) return "invalid";

  const cached = holder.__tutelliaLicense;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.status;

  const status = await checkRemote(key);
  // An unreachable OrigAI is retried sooner than a definite answer.
  holder.__tutelliaLicense = { status, at: status === "unknown" ? Date.now() - CACHE_MS + 10 * 60 * 1000 : Date.now() };
  return status;
}

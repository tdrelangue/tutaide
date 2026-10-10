import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAppVersion, isServerMode } from "@/lib/deployment";

/**
 * Health check for monitoring and for the desktop app's "Serveur de ma
 * structure" mode: is the server up, which version, can it reach its database.
 * Public on purpose (no data, only status).
 */
// Readable by the desktop app's start-up page (another origin): status only.
const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

export async function GET(): Promise<NextResponse> {
  const version = getAppVersion();
  const mode = isServerMode() ? "server" : "desktop";
  try {
    await db.appSetting.findFirst({ select: { key: true } }); // reachability only
    return NextResponse.json({ status: "ok", version, mode, database: "ok" }, { headers: CORS });
  } catch {
    return NextResponse.json({ status: "error", version, mode, database: "unreachable" }, { status: 503, headers: CORS });
  }
}

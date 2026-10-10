import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isServerMode } from "@/lib/deployment";

/**
 * Licence check for self-hosted organisation servers (runs on OrigAI's
 * deployment, tutaide.vercel.app). The server sends its key; the answer says
 * whether the licence is active. Keys are 64 random hex characters, so they
 * cannot be guessed. Only the organisation name is returned, no other data.
 */
const bodySchema = z.object({ key: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  // An organisation server never answers licence checks itself.
  if (isServerMode()) return NextResponse.json({ error: "Indisponible" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ valid: false }, { status: 200 });

  try {
    const org = await db.organization.findUnique({
      where: { licenseKey: parsed.data.key },
      select: { name: true, archivedAt: true },
    });
    const valid = org !== null && org.archivedAt === null;
    return NextResponse.json({ valid, organisation: valid ? org.name : null });
  } catch (error) {
    console.error("[license] check failed", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

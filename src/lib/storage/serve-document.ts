import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/access/context";
import { resolveOwnerIds } from "@/lib/access/scope";
import { db } from "@/lib/db";
import { readDocumentFile } from "./document-files";

/**
 * Shared body of /api/documents/[id]/preview (inline: the webview renders it)
 * and /download (attachment: saved by the browser).
 * Same access rule as every screen: the effective user's own documents, or
 * their MJPMs' for an assistant (an impersonating admin acts as that user).
 */
export async function serveDocument(
  id: string,
  disposition: "inline" | "attachment"
): Promise<NextResponse> {
  try {
    const context = await getActorContext();
    if (!context) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const ownerIds = resolveOwnerIds(context.actor, context.assigned);

    const document = await db.document.findFirst({ where: { id, userId: { in: ownerIds } } });
    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    const fileBuffer = await readDocumentFile(document.blobUrl);
    if (!fileBuffer) {
      return NextResponse.json({ error: "Fichier introuvable sur le disque" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", document.mimeType);
    headers.set(
      "Content-Disposition",
      `${disposition}; filename="${encodeURIComponent(document.filename)}"`
    );
    headers.set("Content-Length", fileBuffer.length.toString());

    return new NextResponse(new Uint8Array(fileBuffer), { status: 200, headers });
  } catch (error) {
    console.error("Document serve error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

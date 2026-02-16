import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;

    const document = await db.document.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    // Fetch from Vercel Blob
    const response = await fetch(document.blobUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Erreur lors de la récupération du fichier" },
        { status: 500 }
      );
    }

    const blob = await response.blob();

    const headers = new Headers();
    headers.set("Content-Type", document.mimeType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(document.filename)}"`
    );
    headers.set("Content-Length", document.size.toString());

    return new NextResponse(blob, { status: 200, headers });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Erreur interne" },
      { status: 500 }
    );
  }
}

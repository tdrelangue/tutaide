import { NextRequest } from "next/server";
import { serveDocument } from "@/lib/storage/serve-document";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return serveDocument(id, "attachment");
}

import { NextRequest } from "next/server";
import { serveDocument } from "@/lib/storage/serve-document";

// Same as /download but with Content-Disposition: inline so the browser
// can render the file instead of forcing a download.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return serveDocument(id, "inline");
}

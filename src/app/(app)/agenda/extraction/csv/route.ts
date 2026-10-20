import { NextResponse, type NextRequest } from "next/server";
import { getAgendaAccess } from "@/lib/agenda/context";
import { auditQuerySchema, buildAuditExport, exportFileName, toCsv } from "@/lib/agenda/audit-export";
import { ownerToday } from "@/lib/agenda/bridge/load";
import { failureMessage } from "../../action-errors";

/** GET /agenda/extraction/csv?personne=…&du=…&au=… — the same export as the page, as a spreadsheet file. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const access = await getAgendaAccess();
    if (access.status !== "ok") return NextResponse.json({ error: "Agenda indisponible" }, { status: 403 });
    const params = request.nextUrl.searchParams;
    const query = auditQuerySchema.parse({ personId: params.get("personne"), from: params.get("du"), to: params.get("au") });
    const data = await buildAuditExport(access.ownerId, query, await ownerToday(access.ownerId, new Date()));
    return new NextResponse(toCsv(data), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(data)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: failureMessage("auditCsv", error) }, { status: 400 });
  }
}

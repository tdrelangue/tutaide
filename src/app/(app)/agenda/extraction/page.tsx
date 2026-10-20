import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getAgendaAccess } from "@/lib/agenda/context";
import { auditQuerySchema, buildAuditExport, STATUS_WORD, type AuditExport, type AuditRow } from "@/lib/agenda/audit-export";
import { ownerToday } from "@/lib/agenda/bridge/load";
import { listAgendaPersons } from "@/lib/agenda/service";
import { failureMessage } from "../action-errors";
import { PrintButton } from "./print-button";

type SearchParams = Promise<{ personne?: string; du?: string; au?: string }>;

const DATE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function longDate(iso: string): string {
  return DATE.format(new Date(`${iso}T12:00:00Z`));
}
function shortDate(iso: string): string {
  return SHORT.format(new Date(`${iso}T12:00:00Z`));
}
function hm(minutes: number): string {
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

/** January 1st of last year → today: a sensible default period for an audit. */
function defaultPeriod(today: string): { from: string; to: string } {
  return { from: `${Number(today.slice(0, 4)) - 1}-01-01`, to: today };
}

/**
 * « Extraction pour un audit »: the rendez-vous with one protected person over
 * a period, with notes and checklists. Printable (PDF from the print dialog)
 * and downloadable as a spreadsheet (CSV).
 */
export default async function ExtractionPage({ searchParams }: { searchParams: SearchParams }) {
  const [access, params] = await Promise.all([getAgendaAccess(), searchParams]);
  if (access.status === "unavailable") redirect("/dashboard");
  if (access.status === "choose") redirect("/agenda");

  const [persons, today] = await Promise.all([listAgendaPersons(access.ownerId), ownerToday(access.ownerId, new Date())]);
  const period = defaultPeriod(today);
  const query = { personId: params.personne ?? "", from: params.du ?? period.from, to: params.au ?? period.to };
  const result = await runExport(access.ownerId, query, today, params.personne !== undefined);

  return (
    <div className="space-y-6 p-4 sm:p-6 print:p-0">
      <div className="space-y-1 print:hidden">
        <Link href="/agenda?tab=personnes" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft aria-hidden="true" />
          Retour à l&apos;agenda
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Extraction pour un audit</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tous les rendez-vous et visites avec une personne sur une période, avec leurs notes et leurs tâches. À imprimer
          (ou enregistrer en PDF) ou à télécharger pour un tableur.
        </p>
      </div>
      <QueryForm persons={persons.map((p) => ({ id: p.id, name: p.fullName }))} query={query} />
      {result.error && <p role="alert" className="text-sm font-medium text-red-700">{result.error}</p>}
      {result.data && <Report data={result.data} ownerName={access.ownerName} today={today} query={query} />}
    </div>
  );
}

async function runExport(ownerId: string, raw: unknown, today: string, asked: boolean): Promise<{ data?: AuditExport; error?: string }> {
  if (!asked) return {};
  try {
    return { data: await buildAuditExport(ownerId, auditQuerySchema.parse(raw), today) };
  } catch (error) {
    return { error: failureMessage("auditExport", error) };
  }
}

type Query = { personId: string; from: string; to: string };

function QueryForm({ persons, query }: { persons: { id: string; name: string }[]; query: Query }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 print:hidden">
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">
        Personne
        <select name="personne" defaultValue={query.personId} required className="h-10 rounded-md border bg-background px-3 text-sm font-normal">
          <option value="" disabled>Choisir…</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Du
        <input type="date" name="du" defaultValue={query.from} required className="h-10 rounded-md border bg-background px-3 text-sm font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Au
        <input type="date" name="au" defaultValue={query.to} required className="h-10 rounded-md border bg-background px-3 text-sm font-normal" />
      </label>
      <button type="submit" className={buttonVariants()}>Afficher</button>
    </form>
  );
}

function Report({ data, ownerName, today, query }: { data: AuditExport; ownerName: string; today: string; query: Query }) {
  const csv = `/agenda/extraction/csv?${new URLSearchParams({ personne: query.personId, du: data.from, au: data.to })}`;
  return (
    <section aria-labelledby="report-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <PrintButton />
        <a href={csv} className={buttonVariants({ variant: "outline" })}>
          <FileDown aria-hidden="true" />
          Télécharger pour un tableur (CSV)
        </a>
      </div>
      <header className="space-y-1 border-b pb-3">
        <h2 id="report-title" className="text-lg font-semibold">Rendez-vous avec {data.personName}</h2>
        <p className="text-sm">
          Du {shortDate(data.from)} au {shortDate(data.to)} · {data.rows.length} rendez-vous
        </p>
        <p className="text-xs text-muted-foreground">
          Agenda de {ownerName} · extraction du {shortDate(today)} · Tutellia
        </p>
        <p className="text-xs text-muted-foreground">
          « Vu » : prévu au planning validé, jour passé, et non signalé comme n&apos;ayant pas eu lieu.
        </p>
      </header>
      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rendez-vous avec cette personne sur la période.</p>
      ) : (
        <ol className="space-y-3">
          {data.rows.map((row, i) => (
            <ReportRow key={`${row.date}-${row.startMin}-${i}`} row={row} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ReportRow({ row }: { row: AuditRow }) {
  return (
    <li className="break-inside-avoid rounded-md border p-3 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold first-letter:uppercase">
          {longDate(row.date)}, {hm(row.startMin)} – {hm(row.endMin)}
        </span>
        <span className="text-xs font-medium">{STATUS_WORD[row.status]}</span>
      </p>
      <p className="font-medium">
        {row.kind === "VISIT" ? "Visite" : "Rendez-vous"} : {row.title}
      </p>
      <p className="text-xs text-muted-foreground">
        {row.placeLabel}
        {row.placeAddress && ` — ${row.placeAddress}`}
        {row.otherParticipants.length > 0 && ` · avec ${row.otherParticipants.join(", ")}`}
      </p>
      {row.tasks.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {row.tasks.map((t, i) => (
            <li key={i}>
              <span aria-hidden="true">{t.done ? "☑" : "☐"}</span> <span className="sr-only">{t.done ? "Fait : " : "À faire : "}</span>
              {t.label}
            </li>
          ))}
        </ul>
      )}
      {row.notes && <p className="mt-2 whitespace-pre-wrap border-l-2 pl-2">{row.notes}</p>}
    </li>
  );
}

import type { AuditRow } from "@/lib/organizations/audit";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Every change made in this panel, newest first (who, what, for whom). */
export function JournalTab({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune modification enregistrée pour l&apos;instant.</p>;
  }
  return (
    <div className="max-w-4xl space-y-2">
      <p className="text-sm text-muted-foreground">
        Toutes les modifications faites dans l&apos;administration de la structure (200 dernières).
      </p>
      <ol className="divide-y rounded-lg border" aria-label="Journal des modifications">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[9rem_1fr]">
            <time className="text-muted-foreground" dateTime={row.createdAt.toISOString()}>
              {DATE_FORMAT.format(row.createdAt)}
            </time>
            <p>
              <span className="font-medium">{row.actorName}</span>
              {row.byOrigAI && <span className="text-muted-foreground"> (via le support OrigAI)</span>} · {row.action}
              {row.targetName && <> · <span className="font-medium">{row.targetName}</span></>}
              {row.details && <span className="text-muted-foreground"> — {row.details}</span>}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

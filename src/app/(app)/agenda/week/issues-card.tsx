import { AlertTriangle } from "lucide-react";
import type { IssueView } from "@/lib/agenda/views/types";

/** Agenda tabs a fix can point to (keys of agenda-client's TABS). */
const TAB_LABEL: Readonly<Record<string, string>> = {
  planning: "Planning",
  "rendez-vous": "Rendez-vous",
  personnes: "Personnes à visiter",
  parametres: "Paramètres",
};

type IssuesCardProps = {
  readonly issues: readonly IssueView[];
  readonly title: string;
};

/**
 * Rows the agenda could not use, each with where to fix it. The link reloads
 * the page on that tab (the tabs read ?tab= only when the page opens).
 */
export function IssuesCard({ issues, title }: IssuesCardProps) {
  if (issues.length === 0) return null;
  return (
    <section aria-label={title} className="rounded-lg border border-agenda-warn bg-agenda-warn-soft p-4 text-sm">
      <h3 className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0 text-agenda-warn" aria-hidden="true" />
        {title}
      </h3>
      <ul className="space-y-1.5">
        {issues.map((issue, i) => (
          <li key={`${issue.kind}-${i}`}>
            {issue.message}
            {issue.fixTab && TAB_LABEL[issue.fixTab] && (
              <>
                {" "}
                <a href={`/agenda?tab=${encodeURIComponent(issue.fixTab)}`} className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Corriger dans « {TAB_LABEL[issue.fixTab]} »
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

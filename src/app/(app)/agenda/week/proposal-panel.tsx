"use client";

import type { ReactNode, RefObject } from "react";
import { AlertOctagon, CheckCircle2, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BentView, ProblemView, ProposalMeta } from "@/lib/agenda/views/types";
import { PRIORITY_LABEL, REASON_LABEL, dayShort, km, plural } from "./format";
import { BusyButton } from "./busy-button";
import { QuestionCard } from "./question-card";

type ProposalPanelProps = {
  readonly proposal: ProposalMeta | null;
  /** The « Proposition » title: focus target when a refused exception leaves the list. */
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
  readonly busy: boolean;
  readonly onAnswer: (ruleKey: string, answer: "respect" | "break" | null) => void;
  readonly onRefuse: (ruleKey: string) => void;
};

/** What the proposal needs from the user, most urgent first. Beside the grid from 1280 px, below it otherwise. */
export function ProposalPanel({ proposal, titleRef, busy, onAnswer, onRefuse }: ProposalPanelProps) {
  if (proposal === null) return <NoProposal />;
  return (
    <aside aria-labelledby="agenda-proposal-title" className="space-y-3">
      <SummarySection proposal={proposal} titleRef={titleRef} />
      {proposal.questions.length > 0 && (
        <Section title="Questions « Important »" tone="ask">
          <div className="space-y-3">
            {proposal.questions.map((q) => (
              <QuestionCard key={q.ruleKey} question={q} busy={busy} onAnswer={onAnswer} />
            ))}
          </div>
        </Section>
      )}
      <ProblemsSection problems={proposal.problems} />
      <BentSection bent={proposal.bent} softMissed={proposal.softMissed} busy={busy} onRefuse={onRefuse} />
      {proposal.postponed.length > 0 && (
        <Section title="Reportées sans vous déranger (priorité basse)">
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {proposal.postponed.map((p) => (
              <li key={`${p.title}-${p.due}`}>
                {p.title} <span className="text-muted-foreground">(prévue vers le {dayShort(p.due)})</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  );
}

function SummarySection({ proposal, titleRef }: { proposal: ProposalMeta; titleRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <Section titleId="agenda-proposal-title" titleRef={titleRef} title="Proposition">
      <p className="text-sm font-medium">
        {plural(proposal.placedCount, "visite", "visites")} · {km(proposal.totalKm)}
      </p>
      <p className="text-xs text-muted-foreground">Rien n&apos;est planifié tant que vous n&apos;avez pas validé la semaine.</p>
      {proposal.estimatedRouteCount > 0 && <EstimatedRoutesNotice count={proposal.estimatedRouteCount} />}
    </Section>
  );
}

/**
 * The views carry only a count of estimated road times (no per-entry flag),
 * so the notice says plainly what it means and what to check.
 */
function EstimatedRoutesNotice({ count }: { count: number }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded border border-agenda-warn bg-agenda-warn-soft p-2 text-xs text-foreground">
      <Route className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">Temps de route approximatifs</p>
        <p>
          Le calcul d&apos;itinéraire (IGN) n&apos;a pas répondu pour {plural(count, "trajet", "trajets")} : leur durée est
          seulement estimée. Vérifiez les enchaînements serrés avant de valider, ou recalculez la proposition
          plus tard.
        </p>
      </div>
    </div>
  );
}

function NoProposal() {
  return (
    <aside aria-label="Proposition" className="rounded-lg border border-dashed p-4 text-sm">
      <p className="font-medium">Pas encore de proposition</p>
      <p className="mt-1 text-muted-foreground">
        « Préparer une proposition » place vos visites et rendez-vous de la semaine. Vous pouvez ensuite déplacer des
        blocs, répondre aux questions, puis valider. Seul le planning validé compte.
      </p>
    </aside>
  );
}

type SectionProps = {
  readonly title: string;
  readonly titleId?: string;
  readonly titleRef?: RefObject<HTMLHeadingElement | null>;
  readonly tone?: "ask" | "alert";
  readonly children: ReactNode;
};

function Section({ title, titleId, titleRef, tone, children }: SectionProps) {
  return (
    <section
      aria-labelledby={titleId}
      aria-label={titleId ? undefined : title}
      className={cn(
        "rounded-lg border bg-background p-4",
        tone === "ask" && "border-primary/50",
        tone === "alert" && "border-2 border-destructive",
      )}
    >
      <h3
        id={titleId}
        ref={titleRef}
        tabIndex={titleRef ? -1 : undefined}
        className="mb-2 flex items-center gap-2 rounded-sm text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tone === "alert" && <AlertOctagon className="h-4 w-4 text-destructive" aria-hidden="true" />}
        {title}
      </h3>
      {children}
    </section>
  );
}

function problemText(problem: ProblemView): string {
  if (problem.reason === "LATE" && problem.lateDays !== null) {
    return `placé ${plural(problem.lateDays, "jour", "jours")} après la date prévue`;
  }
  return REASON_LABEL[problem.reason];
}

/** « Incontournable » not placed come first, as an alert; then the other problems. */
function ProblemsSection({ problems }: { problems: readonly ProblemView[] }) {
  if (problems.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-agenda-held" aria-hidden="true" />
        Tout ce qui est dû cette semaine est placé.
      </p>
    );
  }
  const alerts = problems.filter((p) => p.isAlert);
  const others = problems.filter((p) => !p.isAlert);
  return (
    <>
      {alerts.length > 0 && (
        <Section title="Incontournables non placés" tone="alert">
          <ProblemList problems={alerts} />
        </Section>
      )}
      {others.length > 0 && (
        <Section title="Non placés ou en retard">
          <ProblemList problems={others} />
        </Section>
      )}
    </>
  );
}

function ProblemList({ problems }: { problems: readonly ProblemView[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {problems.map((p, i) => (
        <li key={`${p.title}-${i}`}>
          <span className="font-medium">{p.title}</span> <span className="text-xs">(priorité {PRIORITY_LABEL[p.priority]})</span> :{" "}
          {problemText(p)}
        </li>
      ))}
    </ul>
  );
}

type BentSectionProps = {
  readonly bent: readonly BentView[];
  readonly softMissed: ProposalMeta["softMissed"];
  readonly busy: boolean;
  readonly onRefuse: (ruleKey: string) => void;
};

function BentSection({ bent, softMissed, busy, onRefuse }: BentSectionProps) {
  if (bent.length === 0 && softMissed.length === 0) return null;
  return (
    <Section title="Règles « Souhaité » et préférences">
      <ul className="space-y-2 text-sm">
        {bent.map((b) => (
          <BentItem key={`${b.ruleKey}-${b.title}-${b.date}`} bent={b} busy={busy} onRefuse={onRefuse} />
        ))}
        {softMissed.map((m) => (
          <li key={`${m.label}-${m.date}`} className="text-muted-foreground">
            Préférence « {m.label} » non suivie ({dayShort(m.date)})
          </li>
        ))}
      </ul>
    </Section>
  );
}

function BentItem({ bent, busy, onRefuse }: { bent: BentView; busy: boolean; onRefuse: (ruleKey: string) => void }) {
  function handleRefuse() {
    onRefuse(bent.ruleKey);
  }
  return (
    <li className="space-y-1">
      <p>
        « {bent.label} » non respecté pour <span className="font-medium">{bent.title}</span> ({dayShort(bent.date)})
      </p>
      <BusyButton size="sm" variant="outline" onClick={handleRefuse} busy={busy}>
        Refuser cette exception
      </BusyButton>
    </li>
  );
}

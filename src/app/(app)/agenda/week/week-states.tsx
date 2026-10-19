"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeekView } from "@/lib/agenda/views/types";
import { ERROR_TEXT } from "../address-field";
import type { WeekMode } from "./use-week-data";

const SKELETON_DAYS = 7;

/** First load: the grid's shape, without data. */
export function GridSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-2 rounded-lg border p-2 sm:grid-cols-7">
      {Array.from({ length: SKELETON_DAYS }, (_, i) => (
        <div key={i} className="space-y-2 max-sm:[&:nth-child(n+4)]:hidden">
          <div className="h-8 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-64 rounded bg-agenda-paper ring-1 ring-border motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/60 p-4">
      <p className={ERROR_TEXT}>{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
        <RefreshCw aria-hidden="true" />
        Réessayer
      </Button>
    </div>
  );
}

type BusyProps = { readonly mode: WeekMode; readonly isActing: boolean; readonly isValidating: boolean };

function busyMessage({ mode, isActing, isValidating }: BusyProps): string {
  if (mode === "proposing") return "Calcul des trajets… quelques secondes.";
  if (mode === "loading") return "Chargement de la semaine…";
  if (isValidating) return "Validation de la semaine…";
  if (isActing) return "Enregistrement…";
  return "";
}

/** Always mounted, so screen readers hear each change of state. */
export function BusyStatus(props: BusyProps) {
  const message = busyMessage(props);
  return (
    <p role="status" aria-live="polite" className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground">
      {message && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
      {message}
    </p>
  );
}

export function isEmptyWeek(view: WeekView): boolean {
  return view.proposal === null && view.days.every((d) => d.entries.length === 0);
}

export function EmptyWeekNote() {
  return (
    <p className="rounded-lg border border-dashed p-4 text-sm">
      Rien n&apos;est encore planifié cette semaine. Cliquez sur « Préparer une proposition » : Tutellia place vos visites
      et rendez-vous, vous ajustez, puis vous validez.
    </p>
  );
}

export function SetupNotice() {
  return (
    <p className="max-w-xl rounded-lg border border-dashed p-6 text-sm">
      Pour préparer vos tournées, indiquez d&apos;abord votre domicile dans{" "}
      <a href="/agenda?tab=parametres" className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        « Paramètres »
      </a>{" "}
      : c&apos;est le point de départ et d&apos;arrivée de chaque journée.
    </p>
  );
}

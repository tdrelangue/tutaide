"use client";

import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EntryView, IsoDate } from "@/lib/agenda/views/types";
import { formatDayLong, formatTime } from "./format";
import type { MissedDialogProps } from "./shared-contracts";

export type MissedItem = NonNullable<MissedDialogProps["item"]>;

/** The server always fills `date` on these entries (« ont-ils eu lieu ? » list). */
function dateOf(entry: EntryView): IsoDate {
  return entry.date ?? "";
}

export function toMissedItem(entry: EntryView): MissedItem | null {
  if (entry.itemKey === null) return null;
  return { itemKey: entry.itemKey, title: entry.title, date: dateOf(entry), kind: entry.kind };
}

type ConfirmPanelProps = {
  readonly entries: readonly EntryView[];
  readonly onMissed: (item: MissedItem) => void;
};

/** Rule 11 / D10: a quiet reminder of the past week's validated items. Hidden when empty. */
export function ConfirmPanel({ entries, onMissed }: ConfirmPanelProps) {
  const items = entries.filter((e) => e.canMarkMissed && e.itemKey !== null);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="confirm-heading" className="space-y-2 rounded-lg border border-agenda-held/40 bg-agenda-held-soft p-4">
      <h2 id="confirm-heading" className="flex items-center gap-2 text-sm font-semibold">
        <CalendarCheck className="h-4 w-4 text-agenda-held" aria-hidden="true" />
        Ces rendez-vous ont-ils eu lieu ?
      </h2>
      <p className="text-xs text-muted-foreground">Sans réponse de votre part, ils comptent comme faits.</p>
      <ul className="divide-y rounded-md border bg-background">
        {items.map((entry) => <ConfirmRow key={entry.key} entry={entry} onMissed={onMissed} />)}
      </ul>
    </section>
  );
}

function ConfirmRow({ entry, onMissed }: { readonly entry: EntryView; readonly onMissed: (item: MissedItem) => void }) {
  const date = dateOf(entry);
  function handleMissed() {
    const item = toMissedItem(entry);
    if (item) onMissed(item);
  }
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{entry.title}</span>
        <span className="block text-xs text-muted-foreground">
          {date ? `${formatDayLong(date)}, ` : ""}{formatTime(entry.start)}{entry.subtitle ? ` · ${entry.subtitle}` : ""}
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={handleMissed} aria-label={`« ${entry.title} » n'a pas eu lieu`}>
        N&apos;a pas eu lieu
      </Button>
    </li>
  );
}

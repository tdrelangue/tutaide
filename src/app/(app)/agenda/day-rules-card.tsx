"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { DayRuleView } from "@/lib/agenda/day-rules";
import { minutesToTime } from "@/lib/agenda/rules";
import { removeAgendaDayRule } from "./actions";
import { DAY_NAMES, DayRuleDialog, STRENGTH_CHOICES, type RuleKind } from "./day-rule-dialog";
import { useAgendaAction } from "./use-agenda-action";

type Editing = { kind: RuleKind; rule: DayRuleView | null; key: number };

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(`${iso}T00:00:00Z`));
}

function describe(rule: DayRuleView): string {
  if (rule.type === "VACATION") {
    return rule.from === rule.to ? `Le ${formatDate(rule.from)}` : `Du ${formatDate(rule.from)} au ${formatDate(rule.to)}`;
  }
  const day = `Chaque ${DAY_NAMES[rule.dow - 1].toLowerCase()}`;
  const hours = rule.allDay || rule.fromMin === null || rule.toMin === null ? "toute la journée" : `de ${minutesToTime(rule.fromMin)} à ${minutesToTime(rule.toMin)}`;
  const strength = STRENGTH_CHOICES.find((c) => c.value === rule.strength)?.label ?? "";
  return `${day}, ${hours} · ${strength}${rule.atOffice ? " · au bureau" : ""}`;
}

/** « Mes indisponibilités » (weekly, with how strongly they hold) and « Vacances ». */
export function DayRulesCard({ rules }: { rules: DayRuleView[] }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const { run, isBusy } = useAgendaAction();
  const weekly = rules.filter((r) => r.type === "UNAVAILABLE");
  const holidays = rules.filter((r) => r.type === "VACATION");

  function open(kind: RuleKind, rule: DayRuleView | null) {
    setEditing({ kind, rule, key: Date.now() });
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) setEditing(null);
  }

  async function handleDelete(rule: DayRuleView) {
    if (!window.confirm(`Supprimer « ${rule.label} » ?`)) return;
    await run(() => removeAgendaDayRule(rule.id));
  }

  const rowProps = { busy: isBusy, onEdit: open, onDelete: handleDelete };
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold leading-none tracking-tight">Mes indisponibilités</h2>
          <CardDescription>
            Les jours ou les heures où vous ne voulez pas de rendez-vous, ou préférez ne pas en avoir.
            « Impératif » n&apos;est jamais dépassé ; pour « Important », Tutellia vous pose la question
            avant ; « Souhaité » et « Si possible » sont évités autant que possible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RuleList rules={weekly} empty="Aucune indisponibilité : tous vos jours travaillés sont ouverts aux rendez-vous." {...rowProps} />
          <Button type="button" variant="outline" onClick={() => open("UNAVAILABLE", null)} disabled={isBusy}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Ajouter une indisponibilité
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold leading-none tracking-tight">Vacances</h2>
          <CardDescription>Aucun rendez-vous n&apos;est proposé pendant ces périodes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RuleList rules={holidays} empty="Aucune période de vacances." {...rowProps} />
          <Button type="button" variant="outline" onClick={() => open("VACATION", null)} disabled={isBusy}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Ajouter des vacances
          </Button>
        </CardContent>
      </Card>

      {editing && <DayRuleDialog key={editing.key} kind={editing.kind} rule={editing.rule} open onOpenChange={handleOpenChange} />}
    </div>
  );
}

type ListProps = {
  rules: DayRuleView[];
  empty: string;
  busy: boolean;
  onEdit: (kind: RuleKind, rule: DayRuleView) => void;
  onDelete: (rule: DayRuleView) => void;
};

function RuleList({ rules, empty, busy, onEdit, onDelete }: ListProps) {
  if (rules.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-md border">
      {rules.map((rule) => (
        <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{rule.label}</p>
            <p className="text-xs text-muted-foreground">{describe(rule)}</p>
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(rule.type, rule)} disabled={busy} aria-label={`Modifier « ${rule.label} »`}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(rule)} disabled={busy} aria-label={`Supprimer « ${rule.label} »`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

import type { AgendaRule } from "@prisma/client";
import type { SlotRule } from "../../../agenda-engine/domain";
import { isIsoDow, toIso } from "../dates";
import { found, makeIssue, mapMany, rejected } from "../issues";
import type { Many, Mapped } from "../issues";

const unsupported = (row: AgendaRule): Mapped<never> => rejected([makeIssue("rule", row.id, "UNSUPPORTED_RULE")]);
const bad = (row: AgendaRule): Mapped<never> => rejected([makeIssue("rule", row.id, "BAD_RULE")]);

const base = (row: AgendaRule) => ({ id: row.id, label: row.label, strength: row.strength });

/** The engine has no rule bounded by dates, nor one without a weekday. */
const isExpressible = (row: AgendaRule): boolean =>
  row.dow !== null && row.fromDate === null && row.toDate === null;

function mapUnavailable(row: AgendaRule): Mapped<SlotRule> {
  if (!isExpressible(row)) return unsupported(row);
  if (!isIsoDow(row.dow)) return bad(row);
  if (row.allDay === true) return found<SlotRule>({ ...base(row), type: "UNAVAILABLE", dow: row.dow, allDay: true });
  const { fromMin, toMin } = row;
  if (fromMin === null || toMin === null || fromMin >= toMin) return bad(row);
  return found<SlotRule>({
    ...base(row),
    type: "UNAVAILABLE",
    dow: row.dow,
    allDay: false,
    from: fromMin,
    to: toMin,
    atOffice: row.atOffice,
  });
}

function mapMaxVisits(row: AgendaRule): Mapped<SlotRule> {
  if (!isExpressible(row)) return unsupported(row);
  if (!isIsoDow(row.dow) || row.maxVisits === null || row.maxVisits < 0) return bad(row);
  return found<SlotRule>({ ...base(row), type: "MAX_VISITS", dow: row.dow, max: row.maxVisits });
}

function mapVacation(row: AgendaRule): Mapped<SlotRule> {
  if (row.fromDate === null || row.toDate === null) return bad(row);
  const from = toIso(row.fromDate);
  const to = toIso(row.toDate);
  if (from > to) return bad(row);
  // Holidays are always imperative, whatever the stored strength.
  return found<SlotRule>({ ...base(row), strength: "HARD", type: "VACATION", from, to });
}

export function mapRule(row: AgendaRule): Mapped<SlotRule> {
  switch (row.type) {
    case "UNAVAILABLE":
      return mapUnavailable(row);
    case "MAX_VISITS":
      return mapMaxVisits(row);
    case "VACATION":
      return mapVacation(row);
  }
}

export function mapRules(rows: readonly AgendaRule[]): Many<SlotRule> {
  return mapMany(rows, mapRule);
}

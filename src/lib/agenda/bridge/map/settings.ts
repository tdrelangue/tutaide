import type { AgendaSettings } from "@prisma/client";
import type { Place, Settings } from "../../../agenda-engine/domain";
import { unseal, unsealPoint } from "../../sealed";
import { isIsoDow } from "../dates";
import { found, makeIssue, rejected } from "../issues";
import type { Mapped } from "../issues";

function officeOf(row: AgendaSettings, home: Place): Place {
  const point = unsealPoint(row.officePoint);
  // No office: the tour starts and ends at the home coordinates.
  if (point === null) return { ...home, id: "office", label: "Bureau" };
  return { id: "office", label: "Bureau", address: unseal(row.officeAddress) ?? "", ...point };
}

function lunchOf(row: AgendaSettings): readonly [number, number] | null {
  const { lunchStartMin: start, lunchEndMin: end } = row;
  return start === null || end === null ? null : [start, end];
}

/** No home means no planning is possible: the value is null with NO_HOME. */
export function mapSettings(row: AgendaSettings | null): Mapped<Settings> {
  if (row === null) return rejected([makeIssue("settings", "none", "NO_HOME")]);
  const point = unsealPoint(row.homePoint);
  if (point === null) return rejected([makeIssue("settings", row.id, "NO_HOME")]);
  const workDays = [...new Set(row.workDays)].filter(isIsoDow);
  if (workDays.length === 0) return rejected([makeIssue("settings", row.id, "NO_WORK_DAYS")]);
  const home: Place = { id: "home", label: "Domicile", address: unseal(row.homeAddress) ?? "", ...point };
  return found({
    home,
    office: officeOf(row, home),
    workDays,
    dayStart: row.dayStartMin,
    dayEnd: row.dayEndMin,
    dayEndLimit: row.dayEndLimitMin,
    lunch: lunchOf(row),
    visitMinutes: row.defaultVisitMin,
  });
}

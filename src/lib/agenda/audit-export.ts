import { z } from "zod";
import { db } from "@/lib/db";
import { AgendaUserError } from "./bridge/errors";
import { fromIso, isRealDate, toIso } from "./bridge/dates";
import { unseal } from "./sealed";

/**
 * « Extraction pour un audit »: every rendez-vous of the planning with one
 * protected person over a period (visits and appointments, held, missed or
 * cancelled), with what is attached to them: place, other participants,
 * notes and checklist. Read only; built on the server, decrypted here.
 */

export type AuditTask = { readonly label: string; readonly done: boolean };

export type AuditRow = {
  readonly date: string;
  readonly startMin: number;
  readonly endMin: number;
  readonly kind: "VISIT" | "APPT";
  readonly title: string;
  readonly status: "DONE" | "PLANNED" | "MISSED" | "CANCELLED";
  readonly placeLabel: string;
  readonly placeAddress: string;
  readonly otherParticipants: readonly string[];
  readonly notes: string;
  readonly tasks: readonly AuditTask[];
};

export type AuditExport = {
  readonly personName: string;
  readonly from: string;
  readonly to: string;
  readonly rows: readonly AuditRow[];
};

/** Ten years at most: an audit looks back over a measure, not further. */
const MAX_DAYS = 3660;
const DAY_MS = 86_400_000;

export const auditQuerySchema = z
  .object({
    personId: z.string().regex(/^[a-z0-9]{20,40}$/, "Choisissez une personne."),
    from: z.string().refine(isRealDate, "Date de début invalide."),
    to: z.string().refine(isRealDate, "Date de fin invalide."),
  })
  .refine((q) => q.from <= q.to, { message: "La date de fin doit suivre la date de début.", path: ["to"] })
  .refine((q) => (fromIso(q.to).getTime() - fromIso(q.from).getTime()) / DAY_MS <= MAX_DAYS, {
    message: "Période de dix ans au plus.",
    path: ["to"],
  });
export type AuditQuery = z.infer<typeof auditQuerySchema>;

type Status = AuditRow["status"];

/**
 * « Vu » only once its day is over: a rendez-vous later today is still « Prévu ».
 * A past validated item is « Vu » unless it was marked « N'a pas eu lieu ».
 */
export function statusOf(stored: "VALIDATED" | "MISSED" | "CANCELLED", date: string, today: string): Status {
  if (stored === "MISSED") return "MISSED";
  if (stored === "CANCELLED") return "CANCELLED";
  return date < today ? "DONE" : "PLANNED";
}

const ITEM_SELECT = {
  id: true,
  kind: true,
  title: true,
  date: true,
  startMin: true,
  endMin: true,
  status: true,
  placeLabel: true,
  placeAddress: true,
  contactId: true,
  notes: true,
  participants: { select: { contactId: true } },
  tasks: { orderBy: { position: "asc" as const }, select: { label: true, done: true } },
  appointment: { select: { notes: true, tasks: { orderBy: { position: "asc" as const }, select: { label: true, done: true } } } },
} as const;

function decryptTasks(tasks: readonly { label: string; done: boolean }[]): AuditTask[] {
  return tasks.map((t) => ({ label: unseal(t.label) ?? "", done: t.done }));
}

/** The export for one person; refuses a person of another MJPM. `today` is the owner's day ("YYYY-MM-DD"). */
export async function buildAuditExport(ownerId: string, query: AuditQuery, today: string): Promise<AuditExport> {
  const person = await db.agendaContact.findFirst({ where: { id: query.personId, ownerId, category: "PROTEGE" }, select: { id: true, fullName: true } });
  if (!person) throw new AgendaUserError("Cette personne n'est pas dans votre agenda.");
  const items = await db.agendaItem.findMany({
    where: {
      ownerId,
      date: { gte: fromIso(query.from), lte: fromIso(query.to) },
      OR: [{ contactId: person.id }, { participants: { some: { contactId: person.id } } }],
    },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
    select: ITEM_SELECT,
  });
  const otherIds = [...new Set(items.flatMap((i) => i.participants.map((p) => p.contactId)).filter((id) => id !== person.id))];
  const others = await db.agendaContact.findMany({ where: { ownerId, id: { in: otherIds } }, select: { id: true, fullName: true } });
  const names = new Map(others.map((c) => [c.id, c.fullName]));
  const rows = items.map((item): AuditRow => {
    const date = toIso(item.date);
    return {
      date,
      startMin: item.startMin,
      endMin: item.endMin,
      kind: item.kind,
      title: item.title,
      status: statusOf(item.status, date, today),
      placeLabel: item.placeLabel,
      placeAddress: unseal(item.placeAddress) ?? "",
      otherParticipants: item.participants.map((p) => names.get(p.contactId)).filter((n): n is string => n !== undefined),
      notes: unseal(item.appointment?.notes ?? item.notes) ?? "",
      tasks: decryptTasks(item.appointment ? item.appointment.tasks : item.tasks),
    };
  });
  return { personName: person.fullName, from: query.from, to: query.to, rows };
}

// ---- CSV (pure) -------------------------------------------------------------

export const STATUS_WORD: Readonly<Record<Status, string>> = {
  DONE: "Vu",
  PLANNED: "Prévu",
  MISSED: "N'a pas eu lieu",
  CANCELLED: "Annulé",
};

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** French Excel: « ; » separator, quotes doubled, formula-looking cells neutralised. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const HEADER = ["Date", "Début", "Fin", "Type", "Intitulé", "Statut", "Lieu", "Adresse", "Autres participants", "Notes", "Tâches"];

/** UTF-8 with BOM so Excel reads accents; one line per rendez-vous. */
export function toCsv(data: AuditExport): string {
  const lines = data.rows.map((r) =>
    [
      r.date.split("-").reverse().join("/"),
      hhmm(r.startMin),
      hhmm(r.endMin),
      r.kind === "VISIT" ? "Visite" : "Rendez-vous",
      r.title,
      STATUS_WORD[r.status],
      r.placeLabel,
      r.placeAddress,
      r.otherParticipants.join(", "),
      r.notes,
      r.tasks.map((t) => `${t.done ? "[x]" : "[ ]"} ${t.label}`).join(" | "),
    ]
      .map(cell)
      .join(";"),
  );
  return `﻿${[HEADER.map(cell).join(";"), ...lines].join("\r\n")}\r\n`;
}

/** "extraction-jean-bonneau-2026-01-01-2026-10-20.csv": no accent, no space. */
export function exportFileName(data: AuditExport): string {
  const slug = data.personName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `extraction-${slug || "personne"}-${data.from}-${data.to}.csv`;
}

import type { AgendaPlace } from "@prisma/client";
import type { Place } from "../../../agenda-engine/domain";
import { mapMany } from "../issues";
import type { Many } from "../issues";
import { mapPlaceRow } from "./place";

/** Free places of the owner (rows without contact). */
export function mapFreePlaces(rows: readonly AgendaPlace[]): Many<Place> {
  const free = rows.filter((row) => row.contactId === null);
  return mapMany(free, (row) => mapPlaceRow(row, "place", row.id));
}

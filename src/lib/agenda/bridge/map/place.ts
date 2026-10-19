import type { AgendaPlace } from "@prisma/client";
import { VISIO } from "../../../agenda-engine/domain";
import type { Place } from "../../../agenda-engine/domain";
import { seal, sealPoint, unseal, unsealPoint } from "../../sealed";
import { found, makeIssue, rejected } from "../issues";
import type { BridgeIssueKind, Mapped } from "../issues";

/** Label of a snapshot whose place was erased with its contact. */
export const REMOVED_PLACE_LABEL = "Lieu supprimé";

/** The place columns shared by AgendaItem and AgendaPin (address and point are sealed). */
export type PlaceColumns = {
  readonly placeLabel: string;
  readonly placeAddress: string;
  readonly placePoint: string | null;
  readonly placeRemote: boolean;
};

/** A stored place row. null when it has no point. Throws when the address or point is unreadable. */
export function placeFromRow(row: AgendaPlace): Place | null {
  const address = unseal(row.address) ?? "";
  const point = unsealPoint(row.point);
  if (point === null) return null;
  return { id: row.id, label: row.label, address, lat: point.lat, lon: point.lon };
}

/** placeFromRow as a mapper result: a pointless place is reported, not dropped silently. */
export function mapPlaceRow(row: AgendaPlace, kind: BridgeIssueKind, issueId: string): Mapped<Place> {
  const place = placeFromRow(row);
  return place === null ? rejected([makeIssue(kind, issueId, "PLACE_NO_POINT")]) : found(place);
}

/** The place frozen on an item or pin. Throws when the address or point is unreadable. */
export function snapshotPlace(itemKey: string, cols: PlaceColumns): Place {
  if (cols.placeRemote) return VISIO;
  const id = `item:${itemKey}`;
  const point = unsealPoint(cols.placePoint);
  // No point and not remote: the contact (and its address) was erased. No travel.
  if (point === null) return { ...VISIO, id, label: REMOVED_PLACE_LABEL };
  return { id, label: cols.placeLabel, address: unseal(cols.placeAddress) ?? "", lat: point.lat, lon: point.lon };
}

/** Engine place to sealed columns. A video call has no point. */
export function snapshotColumns(place: Place): PlaceColumns {
  return {
    placeLabel: place.label,
    placeAddress: place.address ? seal(place.address) : "",
    placePoint: place.remote ? null : sealPoint({ lat: place.lat, lon: place.lon }),
    placeRemote: place.remote === true,
  };
}

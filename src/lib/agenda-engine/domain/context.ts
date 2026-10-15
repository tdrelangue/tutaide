import type { Contact, Place, PlannerState, TravelModel } from "./model";
import { VISIO, straightLineTravel } from "./travel";

/** The state plus lookups built once per calculation. */
export interface PlannerContext {
  readonly state: PlannerState;
  readonly travel: TravelModel;
  readonly contacts: ReadonlyMap<string, Contact>;
  readonly places: ReadonlyMap<string, Place>;
}

function placeIndex(state: PlannerState): Map<string, Place> {
  const places = new Map<string, Place>();
  for (const c of state.contacts) for (const p of c.places) places.set(p.id, p);
  for (const p of state.places) places.set(p.id, p);
  places.set(VISIO.id, VISIO);
  places.set("home", state.settings.home);
  places.set("office", state.settings.office);
  return places;
}

export function createContext(
  state: PlannerState,
  travel: TravelModel = straightLineTravel,
): PlannerContext {
  return {
    state,
    travel,
    contacts: new Map(state.contacts.map((c) => [c.id, c])),
    places: placeIndex(state),
  };
}

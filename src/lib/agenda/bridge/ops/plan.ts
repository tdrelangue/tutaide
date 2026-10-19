import { db } from "@/lib/db";
import { createContext, propose, toValidatedItems } from "@/lib/agenda-engine/domain";
import type { IsoDate, PlannerState, Proposal, ValidatedItem } from "@/lib/agenda-engine/domain";
import type { FetchLike } from "@/lib/agenda-engine/geo";
import { AgendaConflict, AgendaUserError, rethrowAsConflict } from "../errors";
import { lockPlanning, TX_OPTIONS } from "../lock";
import { parsePeriod } from "../period";
import type { Period } from "../period";
import { planFingerprint } from "../fingerprint";
import type { BridgeIssue } from "../issues";
import { loadPlannerState } from "../load";
import { itemRow } from "../map";
import { travelFor } from "../travel";

export type { Period };
export type PlanDeps = { readonly fetch: FetchLike; readonly now: Date };

export type ProposeResult =
  /** The period is not two real dates, in order, within a month. */
  | { readonly ok: false; readonly reason: "INVALID_INPUT"; readonly issues: readonly BridgeIssue[] }
  /** Nothing can be planned yet (e.g. no home address): `issues` says why. */
  | { readonly ok: false; readonly reason: "NOT_PLANNABLE"; readonly issues: readonly BridgeIssue[] }
  | {
      readonly ok: true;
      readonly today: IsoDate;
      readonly proposal: Proposal;
      /** Sent back with « Valider »: proves the user validates the plan they saw. */
      readonly fingerprint: string;
      /** Road times estimated because IGN did not answer: shown as estimates. */
      readonly estimated: readonly string[];
      readonly issues: readonly BridgeIssue[];
    };

/** Nothing is planned in the past: the period starts today at the earliest. */
function fromToday(period: Period, today: IsoDate): Period {
  return { from: period.from < today ? today : period.from, to: period.to };
}

type Computed =
  | { readonly ok: false; readonly issues: readonly BridgeIssue[] }
  | {
      readonly ok: true;
      readonly state: PlannerState;
      readonly version: number;
      readonly proposal: Proposal;
      readonly estimated: readonly string[];
      readonly issues: readonly BridgeIssue[];
    };

async function computeProposal(ownerId: string, period: Period, deps: PlanDeps): Promise<Computed> {
  const loaded = await loadPlannerState(ownerId, deps.now);
  if (!loaded.ok) return { ok: false, issues: loaded.issues };
  const { state } = loaded;
  const p = fromToday(period, state.today);
  const travel = await travelFor(ownerId, state, p, deps);
  const proposal = propose(createContext(state, travel.model), p.from, p.to);
  return { ok: true, state, version: loaded.version, proposal, estimated: travel.estimated, issues: loaded.issues };
}

/** The proposed plan of a period. Never stored: only a validated plan is the planning (rule 8). */
export async function proposePeriod(ownerId: string, rawPeriod: Period, deps: PlanDeps): Promise<ProposeResult> {
  const period = parsePeriod(rawPeriod);
  if (period === null) return { ok: false, reason: "INVALID_INPUT", issues: [] };
  const result = await computeProposal(ownerId, period, deps);
  if (!result.ok) return { ok: false, reason: "NOT_PLANNABLE", issues: result.issues };
  const { state, proposal, estimated, issues } = result;
  return { ok: true, today: state.today, proposal, fingerprint: planFingerprint(proposal.plan), estimated, issues };
}

/** The items validation adds: what the plan places, minus what was validated already. */
function newItems(state: PlannerState, proposal: Proposal): ValidatedItem[] {
  const known = new Set(state.validated.map((v) => v.id));
  return toValidatedItems(proposal.plan).filter((v) => !known.has(v.id));
}

async function writeValidated(ownerId: string, version: number, items: readonly ValidatedItem[]): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await lockPlanning(tx, ownerId, version);
      for (const item of items) {
        const participants = [...new Set(item.participants)].map((contactId) => ({ contactId }));
        await tx.agendaItem.create({ data: { ...itemRow(item, ownerId), participants: { create: participants } } });
      }
      await tx.agendaPin.deleteMany({ where: { ownerId, itemKey: { in: items.map((v) => v.id) } } });
    }, TX_OPTIONS);
  } catch (error) {
    rethrowAsConflict(error, "Ce planning vient d'être validé par ailleurs. Rechargez la page.");
  }
}

/**
 * Validates the plan the user saw. The plan is computed again on the server
 * (never taken from the page) and must match `fingerprint`; otherwise nothing
 * is written and AgendaConflict asks the user to look again. A write computed
 * on a state that moved meanwhile is refused too (planning lock). Returns the
 * number of items added to the planning.
 */
export async function validatePeriod(ownerId: string, rawPeriod: Period, fingerprint: string, deps: PlanDeps): Promise<number> {
  const period = parsePeriod(rawPeriod);
  if (period === null) throw new AgendaUserError("Période invalide : indiquez deux dates, la fin après le début, sur un mois au plus.");
  const result = await computeProposal(ownerId, period, deps);
  if (!result.ok) throw new AgendaConflict("L'agenda ne peut pas encore être planifié : complétez les paramètres.");
  if (planFingerprint(result.proposal.plan) !== fingerprint) {
    throw new AgendaConflict("Le planning a changé depuis son affichage. Vérifiez la nouvelle proposition avant de valider.");
  }
  const items = newItems(result.state, result.proposal);
  if (items.length === 0) return 0;
  await writeValidated(ownerId, result.version, items);
  return items.length;
}

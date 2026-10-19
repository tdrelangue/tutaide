import { createHash } from "node:crypto";
import { toValidatedItems } from "@/lib/agenda-engine/domain";
import type { Plan, ValidatedItem } from "@/lib/agenda-engine/domain";

const FINGERPRINT_LENGTH = 32;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** One line per item: what the user sees (which, where, when, with whom, how urgent, titled how). */
function lineOf(v: ValidatedItem): string {
  const participants = [...v.participants].sort().join(",");
  return [v.id, v.date, v.start, v.end, v.place.id, participants, v.priority, sha256(v.title)].join("|");
}

/**
 * What the user sees of a proposed plan, reduced to a short hash: which item,
 * which day, which time, which place, who, how urgent, and the title. Proposals
 * are never stored (the planning is only what was validated), so validation
 * recomputes the plan and compares fingerprints: if anything changed in between
 * (an assistant edited the agenda, a title was renamed, a road time arrived),
 * the user is asked to look again instead of validating something they never saw.
 */
export function planFingerprint(plan: Plan): string {
  const lines = toValidatedItems(plan).map(lineOf);
  return sha256(lines.join("\n")).slice(0, FINGERPRINT_LENGTH);
}

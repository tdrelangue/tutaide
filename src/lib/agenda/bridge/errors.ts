/**
 * An error whose message is safe and useful to show to the user. Anything that
 * is not an AgendaUserError is a bug or an outage and must never reach the screen.
 * Rule: an expected refusal is a returned outcome; a race or a vanished row is
 * a thrown AgendaConflict.
 */
export class AgendaUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgendaUserError";
  }
}

/**
 * The agenda changed between what the user saw and what they confirmed
 * (another session, an assistant, a road time that arrived): nothing was
 * written, the user is asked to look again. Its message is safe to show.
 */
export class AgendaConflict extends AgendaUserError {
  constructor(message: string) {
    super(message);
    this.name = "AgendaConflict";
  }
}

/** A refusal of the service layer (cap reached, place in use, unknown participant). */
export class AgendaRefusal extends AgendaUserError {
  constructor(message: string) {
    super(message);
    this.name = "AgendaRefusal";
  }
}

function prismaCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

/** Prisma's unique-constraint violation (e.g. the same occurrence validated twice at once). */
export function isUniqueViolation(error: unknown): boolean {
  return prismaCode(error) === "P2002";
}

/** Prisma's foreign-key violation (P2003) or « record not found » (P2025): a row vanished meanwhile. */
export function isForeignKeyOrMissing(error: unknown): boolean {
  const code = prismaCode(error);
  return code === "P2003" || code === "P2025";
}

/** Rethrows a database race (P2002 / P2003 / P2025) as an AgendaConflict; any other error is rethrown as is. */
export function rethrowAsConflict(error: unknown, message: string): never {
  if (isUniqueViolation(error) || isForeignKeyOrMissing(error)) throw new AgendaConflict(message);
  throw error;
}

import { ZodError } from "zod";
import { AgendaAccessError } from "@/lib/agenda/context";
import { AgendaUserError } from "@/lib/agenda/bridge/errors";

/**
 * The message an /agenda action shows when it fails. Known errors carry a
 * message written for the user; anything else is logged by action name and
 * error type only (never the payload: protected-person data).
 */
export function failureMessage(action: string, error: unknown): string {
  if (error instanceof AgendaAccessError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Données invalides.";
  // AgendaRefusal (service) and AgendaConflict (bridge) both extend it.
  if (error instanceof AgendaUserError) return error.message;
  console.error(`[agenda] ${action} failed:`, error instanceof Error ? error.name : typeof error);
  return "Erreur inattendue. Réessayez ; si cela persiste, contactez le support OrigAI.";
}

import type { AgendaDataResult } from "@/lib/agenda/views/types";

export const UNEXPECTED_ERROR = "Erreur inattendue. Réessayez ; si cela persiste, contactez le support OrigAI.";

export type Outcome<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

/** Runs an /agenda action and never throws: the caller shows the error. */
export async function callAction<T>(action: () => Promise<AgendaDataResult<T>>): Promise<Outcome<T>> {
  try {
    const result = await action();
    return result.success ? { ok: true, data: result.data } : { ok: false, error: result.error };
  } catch {
    return { ok: false, error: UNEXPECTED_ERROR };
  }
}

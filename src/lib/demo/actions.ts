"use server";

import { endDemo, startDemo } from "./runtime";
import { isDemoActive } from "./state";

/** "Tester l'application": prepares a demo and returns its throwaway login. */
export async function startDemoAction(): Promise<
  { success: true; email: string; password: string } | { success: false; error: string }
> {
  try {
    const credentials = await startDemo();
    return { success: true, ...credentials };
  } catch (error) {
    console.error("[startDemoAction]", error);
    const message = error instanceof Error ? error.message : "";
    return {
      success: false,
      error: message.includes("installée") ? message : "La démonstration n'a pas pu démarrer. Réessayez.",
    };
  }
}

/** "Quitter la démo": everything the demo created disappears. */
export async function endDemoAction(): Promise<{ success: boolean }> {
  try {
    // Only a demo session can end a demo: a real account never triggers this.
    if (isDemoActive()) await endDemo();
    return { success: true };
  } catch (error) {
    console.error("[endDemoAction]", error);
    return { success: false };
  }
}

"use server";

import { requireAuth } from "@/lib/auth";
import { createCheckoutUrl } from "@/lib/billing";

const RETURN_PATHS = {
  signup: "/abonnement",
  settings: "/settings?tab=abonnement",
} as const;

const ERROR_MESSAGES: Record<string, string> = {
  already_subscribed: "Votre abonnement est déjà actif.",
  unavailable: "Le service de paiement est momentanément indisponible. Vérifiez votre connexion internet et réessayez.",
};

/** Returns the Stripe Checkout URL for the current (or impersonated) user. */
export async function startCheckoutAction(
  from: keyof typeof RETURN_PATHS
): Promise<{ url?: string; error?: string }> {
  try {
    const userId = await requireAuth();
    const result = await createCheckoutUrl(userId, RETURN_PATHS[from] ?? RETURN_PATHS.settings);
    if ("url" in result) return { url: result.url };
    return { error: ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.unavailable };
  } catch {
    return { error: ERROR_MESSAGES.unavailable };
  }
}

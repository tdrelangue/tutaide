"use server";

import { requireAuth } from "@/lib/auth";
import { ZodError } from "zod";
import { createCheckoutUrl, requestOrgInvoice } from "@/lib/billing";
import { invoiceDetailsSchema, type InvoiceDetails } from "@/lib/stripe-org-billing";

const RETURN_PATHS = {
  signup: "/abonnement",
  settings: "/settings?tab=abonnement",
} as const;

const ERROR_MESSAGES: Record<string, string> = {
  already_subscribed: "Votre abonnement est déjà actif.",
  unavailable: "Le service de paiement est momentanément indisponible. Vérifiez votre connexion internet et réessayez.",
  not_org_admin: "Seul l'administrateur de la structure peut mettre en place l'abonnement.",
  invalid: "Vérifiez les coordonnées de facturation.",
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

/** A structure's admin asks to pay on invoice: Stripe emails the yearly invoice. */
export async function requestInvoiceAction(details: InvoiceDetails): Promise<{ ok?: true; error?: string }> {
  try {
    const userId = await requireAuth();
    const parsed = invoiceDetailsSchema.parse(details);
    const result = await requestOrgInvoice(userId, parsed);
    if ("ok" in result) return { ok: true };
    return { error: ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.unavailable };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? ERROR_MESSAGES.invalid };
    return { error: ERROR_MESSAGES.unavailable };
  }
}

"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startCheckoutAction } from "./actions";

/** Sends the user to Stripe Checkout (inside the app window; Stripe redirects back here). */
export function CheckoutButton({
  from,
  label,
}: {
  from: "signup" | "settings";
  label: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    const result = await startCheckoutAction(from);
    if (result.url) {
      window.location.assign(result.url);
      return; // keep the spinner while Stripe loads
    }
    setError(result.error ?? "Une erreur est survenue.");
    setIsLoading(false);
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={handleClick} disabled={isLoading} className="w-full sm:w-auto">
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {label}
      </Button>
      {isLoading && <p role="status" className="sr-only">Ouverture de la page de paiement…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

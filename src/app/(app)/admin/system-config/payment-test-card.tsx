"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PaymentTestOutcome } from "@/lib/billing";
import { startPaymentTestAction } from "../actions";

/**
 * Lets the software admin run the real payment flow at 0 € before a release:
 * Stripe page, card entry, return to the app, confirmation. The test
 * subscription is cancelled automatically on return (see page.tsx).
 */
export function PaymentTestCard({
  returned,
  outcome,
}: {
  returned: "success" | "cancel" | null;
  outcome: PaymentTestOutcome | null;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function handleStart() {
    setIsStarting(true);
    setStartError(null);
    const result = await startPaymentTestAction();
    if (result.url) {
      window.location.assign(result.url);
      return; // keep the spinner while Stripe loads
    }
    setStartError(result.error ?? "Erreur inconnue.");
    setIsStarting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tester le paiement</CardTitle>
        <CardDescription>
          Ouvre la vraie page de paiement Stripe pour un abonnement à 0 €. Saisissez une carte
          bancaire : rien n&apos;est débité. Au retour dans Tutellia, l&apos;abonnement de test est
          annulé automatiquement. Il n&apos;apparaît jamais comme un vrai abonnement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div aria-live="polite">
          {returned === "success" && outcome?.ok && (
            <div role="status" className="rounded-md border p-4 text-sm space-y-1">
              <p className="font-medium">Test réussi</p>
              <p>
                Stripe a accepté la carte{outcome.cardLabel ? ` (${outcome.cardLabel})` : ""}, le retour
                dans Tutellia fonctionne, et l&apos;abonnement de test à 0 € a été annulé.
              </p>
            </div>
          )}
          {returned === "success" && outcome && !outcome.ok && (
            <p role="alert" className="rounded-md border p-4 text-sm text-destructive">
              Le retour depuis Stripe a eu lieu, mais la vérification a échoué : {outcome.error}
            </p>
          )}
          {returned === "cancel" && (
            <p role="status" className="rounded-md border p-4 text-sm">
              Test interrompu sur la page Stripe. Le retour dans Tutellia fonctionne ; rien n&apos;a été créé.
            </p>
          )}
          {startError && (
            <p role="alert" className="text-sm text-destructive">{startError}</p>
          )}
        </div>

        <Button type="button" variant="outline" onClick={handleStart} disabled={isStarting}>
          {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Lancer un paiement test à 0 €
        </Button>
      </CardContent>
    </Card>
  );
}

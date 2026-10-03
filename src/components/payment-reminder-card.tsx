"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentReminder } from "@/lib/billing";

// Per app session: "Plus tard" hides the card until Tutellia is opened again.
const DISMISS_KEY = "tutellia-payment-reminder-dismissed";

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismiss(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage unavailable: the card simply comes back on the next page.
  }
}

/**
 * Bottom-right card shown every time the app is opened while a paying account
 * is in its 30-day payment grace (failed charge, or first charge date passed
 * without a card). Never blocks the app; one click to fix, one to postpone.
 */
export function PaymentReminderCard({ reminder }: { reminder: PaymentReminder }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!wasDismissed());
  }, []);

  function handleLater() {
    rememberDismiss();
    setVisible(false);
  }

  if (!visible) return null;

  const deadline = format(new Date(reminder.deadline), "d MMMM yyyy", { locale: fr });
  const days = `${reminder.daysLeft} jour${reminder.daysLeft > 1 ? "s" : ""}`;
  const isFailure = reminder.reason === "payment_failed";

  return (
    <aside
      role="alert"
      aria-labelledby="payment-reminder-title"
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-destructive bg-destructive p-4 text-destructive-foreground shadow-lg"
    >
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <p id="payment-reminder-title" className="font-semibold">
            {isFailure ? "Votre moyen de paiement n'est plus valable" : "Aucune carte enregistrée"}
          </p>
          <p className="text-sm">
            {isFailure
              ? "Le dernier prélèvement de votre abonnement n'a pas abouti."
              : "Votre abonnement est arrivé à échéance sans carte enregistrée."}{" "}
            Il vous reste <strong>{days}</strong> (jusqu&apos;au {deadline}) avant la suspension de
            l&apos;accès.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="secondary">
              <Link href="/settings?tab=abonnement" onClick={handleLater}>
                {isFailure ? "Mettre à jour ma carte" : "Enregistrer ma carte"}
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleLater}
              className="text-destructive-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground"
            >
              Plus tard
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLater}
          aria-label="Masquer ce rappel jusqu'à la prochaine ouverture"
          className="rounded p-1 hover:bg-destructive-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

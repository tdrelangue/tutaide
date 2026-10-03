import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { requireAuth } from "@/lib/auth";
import {
  BILLING_PORTAL_URL,
  getBillingState,
  grantsAccess,
  type BillingState,
} from "@/lib/billing";
import { buttonVariants } from "@/components/ui/button";
import { CheckoutButton } from "@/app/(billing)/checkout-button";

function formatDate(iso: string | null): string | null {
  return iso ? format(new Date(iso), "d MMMM yyyy", { locale: fr }) : null;
}

/** Plain-language status line; no alarm colours for a normal state. */
function describeStatus(billing: BillingState): { title: string; detail: string } {
  const date = formatDate(billing.currentPeriodEnd);
  if (!billing.required && !grantsAccess(billing.status)) {
    return { title: "Compte offert", detail: "Aucun paiement n'est demandé pour ce compte." };
  }
  if (billing.status === "unknown") {
    return {
      title: "Statut indisponible",
      detail: "Le service de paiement ne répond pas. Vérifiez votre connexion internet, puis rouvrez cet onglet.",
    };
  }
  if (billing.status === "past_due") {
    return {
      title: "Paiement en attente",
      detail: "Le dernier prélèvement n'a pas abouti. Stripe va réessayer automatiquement ; vous pouvez aussi mettre à jour votre carte ci-dessous.",
    };
  }
  if (billing.status === "trialing") {
    return billing.cancelAtPeriodEnd
      ? { title: "Abonnement résilié", detail: `Votre accès reste ouvert jusqu'au ${date ?? "terme de la période"}. Aucun prélèvement ne sera effectué.` }
      : {
          title: "Carte enregistrée",
          detail: `Premier prélèvement de ${billing.priceLabel.replace(" / an", "")} le ${date ?? "jour prévu"}, puis chaque année à la même date. Vous recevrez une facture par email à chaque prélèvement.`,
        };
  }
  if (grantsAccess(billing.status)) {
    return billing.cancelAtPeriodEnd
      ? { title: "Abonnement résilié", detail: `Votre accès reste ouvert jusqu'au ${date ?? "terme de la période"}. Il ne sera pas renouvelé.` }
      : { title: "Abonnement actif", detail: date ? `Prochain renouvellement automatique le ${date}.` : "Renouvellement automatique chaque année." };
  }
  if (billing.graceUntil) {
    const until = formatDate(billing.graceUntil);
    return {
      title: `Enregistrez votre carte avant le ${until}`,
      detail: `Votre abonnement en cours reste valable jusqu'au ${until} : rien ne change d'ici là. Il suffit d'enregistrer votre carte, aucun montant n'est débité aujourd'hui (0 €). Le premier prélèvement de ${billing.priceLabel.replace(" / an", "")} aura lieu le ${until}, puis chaque année, avec une facture envoyée par email.`,
    };
  }
  return { title: "Aucun abonnement actif", detail: "Mettez en place le paiement pour continuer à utiliser Tutellia." };
}

export async function BillingTab({
  checkout,
  sessionId,
  fresh,
}: {
  checkout?: string;
  sessionId?: string;
  fresh: boolean;
}) {
  const userId = await requireAuth();
  const billing = await getBillingState(userId, { sessionId, fresh });
  const { title, detail } = describeStatus(billing);
  const hasSubscription = grantsAccess(billing.status);
  const canSubscribe = billing.required && !hasSubscription && billing.status !== "unknown";

  return (
    <section aria-labelledby="billing-heading" className="max-w-2xl space-y-6">
      <div>
        <h3 id="billing-heading" className="text-lg font-medium">Abonnement</h3>
        <p className="text-sm text-muted-foreground">
          {billing.required || grantsAccess(billing.status)
            ? `Abonnement annuel — ${billing.priceLabel}, payé par carte via Stripe.`
            : "Abonnement annuel, payé par carte via Stripe."}
        </p>
      </div>

      {checkout === "success" && hasSubscription && (
        <p role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
          {billing.status === "trialing" ? "Merci, votre carte est bien enregistrée." : "Merci, votre paiement est bien enregistré."}
        </p>
      )}
      {checkout === "cancel" && (
        <p role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
          Le paiement n&apos;a pas été effectué. Rien n&apos;a changé sur votre compte.
        </p>
      )}

      <div className="rounded-lg border p-5 space-y-2">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>

      {canSubscribe && (
        <CheckoutButton
          from="settings"
          label={billing.graceUntil ? "Enregistrer ma carte (0 € aujourd'hui)" : "Mettre en place le paiement automatique"}
        />
      )}

      {hasSubscription && BILLING_PORTAL_URL && (
        <div className="space-y-2">
          <a href={BILLING_PORTAL_URL} className={buttonVariants({ variant: "outline" })}>
            Gérer mon paiement
          </a>
          <p className="text-sm text-muted-foreground">
            Changer de carte, télécharger vos factures ou résilier. Stripe vous enverra un code par email
            pour confirmer qu&apos;il s&apos;agit bien de vous.
          </p>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Tutellia ne voit ni ne stocke vos coordonnées bancaires.
      </p>
    </section>
  );
}

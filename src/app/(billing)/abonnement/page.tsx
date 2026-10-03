import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { BILLING_PORTAL_URL, getBillingState, hasPaymentIssue, type BillingState } from "@/lib/billing";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckoutButton } from "../checkout-button";
import { SignOutLink, RecheckButton } from "./abonnement-client";

type SearchParams = Promise<{ checkout?: string; session_id?: string }>;

/** Header texts: first subscription (signup), or access suspended after the 30-day grace. */
function headerFor(billing: BillingState, returnedFromStripe: boolean): { step: string; title: string; description: string } {
  if (returnedFromStripe) {
    return {
      step: "Paiement",
      title: "Confirmation du paiement",
      description: "Stripe confirme votre paiement. Cela prend en général quelques secondes.",
    };
  }
  if (hasPaymentIssue(billing.status)) {
    return {
      step: "Accès suspendu",
      title: "Votre moyen de paiement n'est plus valable",
      description:
        "Le dernier prélèvement n'a pas abouti et le délai de 30 jours est dépassé. Mettez à jour votre carte et réglez la facture en attente pour retrouver l'accès à vos dossiers. Ils sont conservés.",
    };
  }
  if (billing.reminder?.reason === "no_card") {
    return {
      step: "Accès suspendu",
      title: "Réglez votre abonnement",
      description: `Votre abonnement est arrivé à échéance et le délai de 30 jours est dépassé. Réglez votre abonnement (${billing.priceLabel}) pour retrouver l'accès à vos dossiers. Ils sont conservés.`,
    };
  }
  return {
    step: "Étape 2 sur 2 — paiement",
    title: "Activer votre abonnement",
    description: `Abonnement annuel — ${billing.priceLabel}, renouvelé automatiquement chaque année. Vous pourrez changer de carte ou résilier à tout moment depuis les Paramètres.`,
  };
}

export default async function AbonnementPage({ searchParams }: { searchParams: SearchParams }) {
  const { checkout, session_id: sessionId } = await searchParams;
  const userId = await requireAuth();
  const billing = await getBillingState(userId, { sessionId, fresh: true });

  if (billing.hasAccess) redirect("/dossiers");

  const returnedFromStripe = checkout === "success";
  const header = headerFor(billing, returnedFromStripe);
  // A failed renewal is fixed on the existing subscription (Stripe portal), never with a new one.
  const fixInPortal = hasPaymentIssue(billing.status) && BILLING_PORTAL_URL !== null;

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tutellia</h1>
        <p className="mt-2 text-muted-foreground">Gestion des dossiers MJPM</p>
      </div>
      <Card>
        <CardHeader>
          <p className="text-sm font-medium text-muted-foreground">{header.step}</p>
          <CardTitle>{header.title}</CardTitle>
          <CardDescription>{header.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {checkout === "cancel" && (
            <p role="status" className="text-sm text-muted-foreground">
              Le paiement n&apos;a pas été effectué. Vous pouvez réessayer quand vous le souhaitez.
            </p>
          )}
          {returnedFromStripe ? (
            <RecheckButton />
          ) : fixInPortal ? (
            <div className="space-y-3">
              <a href={BILLING_PORTAL_URL ?? undefined} className={buttonVariants()}>
                Mettre à jour ma carte
              </a>
              <p className="text-sm text-muted-foreground">
                Stripe vous enverra un code par email pour confirmer qu&apos;il s&apos;agit bien de vous.
                Une fois la facture réglée, relancez Tutellia.
              </p>
            </div>
          ) : (
            <CheckoutButton from="signup" label="Payer l'abonnement par carte" />
          )}
          <p className="text-sm text-muted-foreground">
            Le paiement se fait sur la page sécurisée de Stripe. Tutellia ne voit ni ne stocke vos
            coordonnées bancaires.
          </p>
          <SignOutLink />
        </CardContent>
      </Card>
    </div>
  );
}

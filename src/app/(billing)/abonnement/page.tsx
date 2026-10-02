import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getBillingState } from "@/lib/billing";
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

export default async function AbonnementPage({ searchParams }: { searchParams: SearchParams }) {
  const { checkout, session_id: sessionId } = await searchParams;
  const userId = await requireAuth();
  const billing = await getBillingState(userId, { sessionId, fresh: true });

  if (billing.hasAccess) redirect("/dossiers");

  const returnedFromStripe = checkout === "success";

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tutellia</h1>
        <p className="mt-2 text-muted-foreground">Gestion des dossiers MJPM</p>
      </div>
      <Card>
        <CardHeader>
          <p className="text-sm font-medium text-muted-foreground">Étape 2 sur 2 — paiement</p>
          <CardTitle>
            {returnedFromStripe ? "Confirmation du paiement" : "Activer votre abonnement"}
          </CardTitle>
          <CardDescription>
            {returnedFromStripe
              ? "Stripe confirme votre paiement. Cela prend en général quelques secondes."
              : `Abonnement annuel — ${billing.priceLabel}, renouvelé automatiquement chaque année. Vous pourrez changer de carte ou résilier à tout moment depuis les Paramètres.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {checkout === "cancel" && (
            <p role="status" className="text-sm text-muted-foreground">
              Le paiement n&apos;a pas été effectué. Vous pouvez réessayer quand vous le souhaitez.
            </p>
          )}
          {returnedFromStripe ? (
            <RecheckButton />
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

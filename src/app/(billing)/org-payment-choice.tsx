"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckoutButton } from "./checkout-button";
import { requestInvoiceAction } from "./actions";

type Method = "card" | "invoice";

type Props = {
  readonly from: "signup" | "settings";
  readonly orgName: string;
  readonly email: string;
  readonly priceLabel: string;
  /** ISO date of the first charge when deferred (existing clients). */
  readonly firstChargeOn: string | null;
};

/**
 * The structure's admin chooses how the structure pays: by card (automatic
 * yearly charge) or on invoice (Stripe emails it; paid by bank transfer).
 */
export function OrgPaymentChoice({ from, orgName, email, priceLabel, firstChargeOn }: Props) {
  const [method, setMethod] = useState<Method>("card");
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Mode de paiement de la structure</legend>
        <MethodOption value="card" current={method} onSelect={setMethod} icon={CreditCard} title="Carte bancaire" detail={`Prélèvement automatique de ${priceLabel.replace(" / an", "")} chaque année.`} />
        <MethodOption value="invoice" current={method} onSelect={setMethod} icon={FileText} title="Sur facture (virement)" detail="Une facture annuelle envoyée par email, à régler sous 30 jours par virement." />
      </fieldset>
      {method === "card" ? (
        <CheckoutButton from={from} label={firstChargeOn ? "Enregistrer la carte de la structure (0 € aujourd'hui)" : "Payer par carte"} />
      ) : (
        <InvoiceForm orgName={orgName} email={email} firstChargeOn={firstChargeOn} />
      )}
    </div>
  );
}

function MethodOption({ value, current, onSelect, icon: Icon, title, detail }: {
  value: Method;
  current: Method;
  onSelect: (m: Method) => void;
  icon: typeof CreditCard;
  title: string;
  detail: string;
}) {
  const id = `pay-${value}`;
  const isSelected = value === current;
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${isSelected ? "border-primary bg-primary/5" : ""}`}>
      <input id={id} type="radio" name="org-pay-method" value={value} checked={isSelected} onChange={() => onSelect(value)} className="mt-1" aria-describedby={`${id}-detail`} />
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span id={`${id}-detail`} className="block text-sm text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

type Details = { companyName: string; email: string; line1: string; postalCode: string; city: string; reference: string };

function InvoiceForm({ orgName, email, firstChargeOn }: { orgName: string; email: string; firstChargeOn: string | null }) {
  const router = useRouter();
  const [details, setDetails] = useState<Details>({ companyName: orgName, email, line1: "", postalCode: "", city: "", reference: "" });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  function field(key: keyof Details) {
    return { value: details[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDetails({ ...details, [key]: e.target.value }) };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    const result = await requestInvoiceAction({ ...details, reference: details.reference.trim() || undefined });
    setIsBusy(false);
    if (result.error) return setError(result.error);
    setIsDone(true);
    router.refresh();
  }

  if (isDone) {
    const when = firstChargeOn ? `le ${new Date(firstChargeOn).toLocaleDateString("fr-FR")}` : "dans l'heure";
    return (
      <p role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
        C&apos;est noté. La facture sera envoyée à {details.email} {when}, avec les coordonnées
        bancaires pour le virement.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Coordonnées de facturation">
      <p className="text-sm text-muted-foreground">Ces informations figurent sur la facture.</p>
      <div className="space-y-1">
        <Label htmlFor="inv-name">Nom de la structure</Label>
        <Input id="inv-name" autoComplete="organization" required {...field("companyName")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="inv-email">Email de facturation</Label>
        <Input id="inv-email" type="email" autoComplete="email" required {...field("email")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="inv-line1">Adresse</Label>
        <Input id="inv-line1" autoComplete="street-address" required {...field("line1")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="inv-postal">Code postal</Label>
          <Input id="inv-postal" inputMode="numeric" autoComplete="postal-code" required {...field("postalCode")} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="inv-city">Ville</Label>
          <Input id="inv-city" autoComplete="address-level2" required {...field("city")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="inv-ref">Référence à indiquer (facultatif)</Label>
        <Input id="inv-ref" maxLength={30} aria-describedby="inv-ref-hint" {...field("reference")} />
        <p id="inv-ref-hint" className="text-xs text-muted-foreground">Bon de commande, numéro d&apos;engagement… (30 caractères maximum).</p>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <Button type="submit" disabled={isBusy}>
        {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Recevoir la facture
      </Button>
    </form>
  );
}

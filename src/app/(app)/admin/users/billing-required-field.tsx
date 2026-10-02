"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BillingPlan = "individual" | "entreprise";

/** "12,50" or "1200" (euros) → cents; null if not a positive amount. */
export function eurosToCents(value: string): number | null {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? Math.round(n * 100) : null;
}

export function centsToEuros(cents: number | null): string {
  return cents === null ? "" : String(cents / 100).replace(".", ",");
}

/** "Compte payant" switch + plan choice, shared by the create and edit user dialogs. */
export function BillingRequiredField({
  id,
  checked,
  onCheckedChange,
  plan,
  onPlanChange,
  amount,
  onAmountChange,
  amountError,
  disabled,
  warnOnEnable,
  hasExistingPrice,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  plan: BillingPlan;
  onPlanChange: (plan: BillingPlan) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  amountError?: string;
  disabled: boolean;
  /** Show the consequence when switching an existing free account to paying. */
  warnOnEnable: boolean;
  /** Editing an account that may already be subscribed at its current price. */
  hasExistingPrice: boolean;
}) {
  function handleCheckedChange(value: boolean | "indeterminate") {
    onCheckedChange(value === true);
  }

  function handlePlanChange(event: React.ChangeEvent<HTMLInputElement>) {
    onPlanChange(event.target.value === "entreprise" ? "entreprise" : "individual");
  }

  function handleAmountChange(event: React.ChangeEvent<HTMLInputElement>) {
    onAmountChange(event.target.value);
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={handleCheckedChange}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor={id}>Compte payant</Label>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {checked
              ? "L'utilisateur doit avoir un abonnement Stripe actif pour utiliser Tutellia."
              : "Compte offert : aucun paiement n'est demandé."}
          </p>
        </div>
      </div>

      {checked && (
        <fieldset className="space-y-2 pl-7" disabled={disabled}>
          <legend className="text-sm font-medium">Formule</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-plan`} value="individual" checked={plan === "individual"} onChange={handlePlanChange} />
            Individuel (tarif standard)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-plan`} value="entreprise" checked={plan === "entreprise"} onChange={handlePlanChange} />
            Entreprise (prix sur mesure)
          </label>
          {plan === "entreprise" && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-amount`}>Prix annuel (€)</Label>
              <Input
                id={`${id}-amount`}
                inputMode="decimal"
                placeholder="ex. 1200"
                value={amount}
                onChange={handleAmountChange}
                aria-invalid={amountError ? "true" : "false"}
                aria-describedby={amountError ? `${id}-amount-error` : undefined}
                className="max-w-40"
              />
              {amountError && (
                <p id={`${id}-amount-error`} className="text-sm text-destructive">{amountError}</p>
              )}
            </div>
          )}
          {hasExistingPrice && (
            <p className="text-sm text-muted-foreground">
              Un changement de formule ou de prix s&apos;applique au prochain abonnement souscrit, pas
              à un abonnement déjà en cours.
            </p>
          )}
        </fieldset>
      )}

      {checked && warnOnEnable && (
        <p role="status" className="text-sm">
          À sa prochaine ouverture de Tutellia, cet utilisateur sera dirigé vers la page de paiement
          tant que son abonnement n&apos;est pas réglé.
        </p>
      )}
    </div>
  );
}

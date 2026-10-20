import { Badge } from "@/components/ui/badge";
import type { OrgListItem } from "../organisations/actions";
import { yearlyLabel } from "./billing-dialogs";

/** « Offert », or « Payant · Offre 10 comptes · 2 400 € / an · 8 / 10 comptes ». */
export function BillingBadge({ org }: { org: OrgListItem }) {
  const { required, plan, startsAt } = org.billing;
  if (!required) return <Badge variant="outline" className="text-xs">Offert</Badge>;
  if (!plan) return <Badge variant="outline" className="border-agenda-warn text-xs">Payant · prix à définir</Badge>;
  const seats = plan.maxSeats === null ? `${org.memberCount} compte${org.memberCount > 1 ? "s" : ""}` : `${org.memberCount} / ${plan.maxSeats} comptes`;
  const isOver = plan.maxSeats !== null && org.memberCount > plan.maxSeats;
  const deferred = startsAt && new Date(startsAt) > new Date() ? ` · dès le ${new Date(startsAt).toLocaleDateString("fr-FR")}` : "";
  return (
    <Badge variant="outline" className={`text-xs ${isOver ? "border-agenda-warn" : ""}`}>
      Payant · {plan.offerName ?? "Prix spécifique"} · {yearlyLabel(plan.yearlyAmountCents)} · {seats}
      {isOver ? " (limite dépassée)" : ""}
      {deferred}
    </Badge>
  );
}

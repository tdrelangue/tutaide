import { redirect } from "next/navigation";
import { getActorContext } from "@/lib/access/context";
import { getOrgOverview } from "@/lib/organizations/overview";
import { listOrgAudit } from "@/lib/organizations/audit";
import { StructureClient } from "./structure-client";

/** Organisation admin panel: members, MJPM ↔ assistant distribution, mail, storage. */
export default async function StructurePage() {
  const context = await getActorContext();
  if (!context?.actor.isOrgAdmin || !context.actor.orgId) redirect("/dashboard");

  const [overview, journal] = await Promise.all([
    getOrgOverview(context.actor.orgId),
    listOrgAudit(context.actor.orgId),
  ]);
  if (!overview) redirect("/dashboard");

  return <StructureClient overview={overview} journal={journal} currentUserId={context.actor.id} />;
}

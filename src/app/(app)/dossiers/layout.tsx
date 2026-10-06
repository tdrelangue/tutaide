import { redirect } from "next/navigation";
import { getActorContext } from "@/lib/access/context";

/**
 * Legacy page (reachable only by typing its address) still scoped to the
 * user's own dossiers: organisation members use the module pages instead.
 */
export default async function LegacyPageLayout({ children }: { children: React.ReactNode }) {
  const context = await getActorContext();
  if (context?.actor.orgId) redirect("/dashboard");
  return children;
}

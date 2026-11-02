import { redirect } from "next/navigation";
import { getAgendaAccess } from "@/lib/agenda/context";
import { listAgendaGroups } from "@/lib/agenda/groups";
import { getAgendaSettings, listAgendaPersons, listImportablePersons } from "@/lib/agenda/service";
import { getMandataireContext } from "@/lib/access/selection-actions";
import { AgendaClient } from "./agenda-client";

/** « Agenda » add-on: persons to visit and planning settings of one MJPM. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [access, mandataires, { tab }] = await Promise.all([getAgendaAccess(), getMandataireContext(), searchParams]);
  if (access.status === "unavailable") redirect("/dashboard");

  if (access.status === "choose") {
    return <AgendaClient data={null} mandataires={mandataires} initialTab={tab} />;
  }

  // Groups first: the first read creates « Mesures » (the persons' default group).
  const groups = await listAgendaGroups(access.ownerId);
  const [profile, persons, importable] = await Promise.all([
    getAgendaSettings(access.ownerId),
    listAgendaPersons(access.ownerId),
    listImportablePersons(access.ownerId),
  ]);
  return (
    <AgendaClient
      data={{ ownerName: access.ownerName, profile, persons, groups, importableCount: importable.length }}
      mandataires={mandataires}
      initialTab={tab}
    />
  );
}

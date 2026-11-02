import { redirect } from "next/navigation";
import { getAgendaAccess } from "@/lib/agenda/context";
import { listAgendaGroups, listGroups } from "@/lib/agenda/groups";
import { addressBookOf, listPartners } from "@/lib/agenda/partners";
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

  // Groups first: the first read creates the default groups (« Mesures », « Avocats »…).
  const book = await addressBookOf(access.ownerId);
  const [groups, partnerGroups] = await Promise.all([listAgendaGroups(access.ownerId), listGroups({ kind: "PARTNERS", book })]);
  const [profile, persons, importable, partners] = await Promise.all([
    getAgendaSettings(access.ownerId),
    listAgendaPersons(access.ownerId),
    listImportablePersons(access.ownerId),
    listPartners(book),
  ]);
  return (
    <AgendaClient
      data={{ ownerName: access.ownerName, profile, persons, groups, partners, partnerGroups, importableCount: importable.length }}
      mandataires={mandataires}
      initialTab={tab}
    />
  );
}

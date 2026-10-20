import type { ReactNode } from "react";
import { MandataireSelect } from "@/components/mandataire-select";
import { getMandataireContext } from "@/lib/access/selection-actions";
import { getAgendaAccess } from "@/lib/agenda/context";
import type { AgendaAccess } from "@/lib/agenda/context";
import { getAgendaSettings } from "@/lib/agenda/service";
import { SettingsTab } from "../agenda/settings-tab";

/** Accounts without the add-on (or admin-only IT accounts) see no « Agenda » tab at all. */
async function agendaAccess(): Promise<AgendaAccess> {
  try {
    return await getAgendaAccess();
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * « Paramètres › Agenda »: the MJPM's home and office, working days and hours.
 * Null when the account has no agenda. For an assistant, the settings are those
 * of the MJPM chosen in the picker (the agenda belongs to the MJPM).
 */
export async function loadAgendaSettingsTab(): Promise<ReactNode | null> {
  const access = await agendaAccess();
  if (access.status === "unavailable") return null;
  const header = (
    <div className="mb-4 max-w-3xl">
      <h3 className="text-lg font-medium">Agenda</h3>
      <p className="text-sm text-muted-foreground">
        Le point de départ de vos tournées et vos horaires de travail : Tutellia ne propose aucune
        visite en dehors.
      </p>
    </div>
  );
  if (access.status === "choose") {
    return (
      <div>
        {header}
        <p className="mb-3 max-w-xl text-sm">L&apos;agenda est propre à chaque mandataire : choisissez celui dont vous réglez l&apos;agenda.</p>
        <MandataireSelect context={await getMandataireContext()} />
      </div>
    );
  }
  const [profile, mandataires] = await Promise.all([getAgendaSettings(access.ownerId), getMandataireContext()]);
  return (
    <div>
      {header}
      {mandataires.choices.length > 0 && <p className="mb-4 text-sm">Agenda de {access.ownerName}.</p>}
      <SettingsTab profile={profile} />
    </div>
  );
}

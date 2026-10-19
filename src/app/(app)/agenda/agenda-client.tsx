"use client";

import { CalendarClock, CalendarDays, ListTodo, Settings2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MandataireSelect } from "@/components/mandataire-select";
import type { MandataireContext } from "@/lib/access/selection-actions";
import type { AgendaPersonView, AgendaSettingsView } from "@/lib/agenda/service";
import { AppointmentsTab } from "./appointments/appointments-tab";
import { PersonsTab } from "./persons-tab";
import { SettingsTab } from "./settings-tab";
import { WeekTab } from "./week/week-tab";

const TABS = ["planning", "rendez-vous", "personnes", "parametres"] as const;
type TabKey = (typeof TABS)[number];

function isTabKey(value: string | undefined): value is TabKey {
  return TABS.some((t) => t === value);
}

type AgendaData = {
  ownerName: string;
  profile: AgendaSettingsView;
  persons: AgendaPersonView[];
  importableCount: number;
};

type Props = {
  /** Null while an assistant has not chosen which MJPM's agenda to open. */
  data: AgendaData | null;
  mandataires: MandataireContext;
  initialTab?: string;
};

export function AgendaClient({ data, mandataires, initialTab }: Props) {
  const isAssistant = mandataires.choices.length > 0;
  const needsSetup = data !== null && data.profile.home === null;
  const personOptions = (data?.persons ?? []).filter((p) => p.status !== "ENDED").map((p) => ({ id: p.id, fullName: p.fullName }));
  const defaultTab: TabKey = isTabKey(initialTab) ? initialTab : needsSetup ? "parametres" : "planning";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
            <p className="text-sm text-muted-foreground">
              {isAssistant && data ? `Agenda de ${data.ownerName}. ` : ""}
              Vos tournées : la semaine proposée, les rendez-vous et les personnes à visiter.
            </p>
          </div>
          {isAssistant && (
            <div className="ml-auto">
              <MandataireSelect context={mandataires} />
            </div>
          )}
        </div>
      </div>

      {/* scroll-pb-28: a focused control scrolled into view never ends up under the sticky « Valider la semaine » bar (WCAG 2.4.11). */}
      <div className="flex-1 overflow-auto scroll-pb-28 p-6">
        {data === null ? (
          <p className="max-w-xl rounded-lg border border-dashed p-6 text-sm">
            L&apos;agenda est propre à chaque mandataire. Choisissez dans la liste ci-dessus le
            mandataire dont vous voulez organiser les visites (seuls les mandataires disposant du
            module Agenda ont un agenda).
          </p>
        ) : (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid h-auto w-full max-w-2xl grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="planning" className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" aria-hidden="true" /> Planning
              </TabsTrigger>
              <TabsTrigger value="rendez-vous" className="flex items-center gap-2">
                <ListTodo className="h-4 w-4" aria-hidden="true" /> Rendez-vous
              </TabsTrigger>
              <TabsTrigger value="personnes" className="flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden="true" /> Personnes à visiter
              </TabsTrigger>
              <TabsTrigger value="parametres" className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" aria-hidden="true" /> Paramètres
              </TabsTrigger>
            </TabsList>
            {needsSetup && (
              <p className="mt-4 max-w-3xl rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900">
                Pour commencer, indiquez votre domicile dans « Paramètres » : c&apos;est le point de
                départ et d&apos;arrivée de vos tournées.
              </p>
            )}
            {/* Panels stay mounted: switching tabs never loses unsaved work (settings, a proposal on screen). */}
            <TabsContent value="planning" forceMount className="mt-6 data-[state=inactive]:hidden">
              <WeekTab needsSetup={needsSetup} persons={personOptions} />
            </TabsContent>
            <TabsContent value="rendez-vous" forceMount className="mt-6 data-[state=inactive]:hidden">
              <AppointmentsTab persons={personOptions} />
            </TabsContent>
            <TabsContent value="personnes" forceMount className="mt-6 data-[state=inactive]:hidden">
              <PersonsTab
                persons={data.persons}
                importableCount={data.importableCount}
                defaultVisitMinutes={data.profile.defaultVisitMinutes}
              />
            </TabsContent>
            <TabsContent value="parametres" forceMount className="mt-6 data-[state=inactive]:hidden">
              <SettingsTab profile={data.profile} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

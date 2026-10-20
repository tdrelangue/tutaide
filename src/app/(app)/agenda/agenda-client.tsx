"use client";

import Link from "next/link";
import { CalendarClock, CalendarDays, ListTodo, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MandataireSelect } from "@/components/mandataire-select";
import type { MandataireContext } from "@/lib/access/selection-actions";
import type { AgendaPersonView, AgendaSettingsView } from "@/lib/agenda/service";
import { AppointmentsTab } from "./appointments/appointments-tab";
import { PersonsTab } from "./persons-tab";
import { AGENDA_SETTINGS_HREF } from "./fix-links";
import { PlanningTab } from "./calendar/planning-tab";

const TABS = ["planning", "rendez-vous", "personnes"] as const;
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
  const defaultTab: TabKey = isTabKey(initialTab) ? initialTab : "planning";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">
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
      <div className="flex-1 overflow-auto scroll-pb-28 p-3 sm:p-6">
        {data === null ? (
          <p className="max-w-xl rounded-lg border border-dashed p-6 text-sm">
            L&apos;agenda est propre à chaque mandataire. Choisissez dans la liste ci-dessus le
            mandataire dont vous voulez organiser les visites (seuls les mandataires disposant du
            module Agenda ont un agenda).
          </p>
        ) : (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid h-auto w-full max-w-xl grid-cols-3">
              <TabsTrigger value="planning" className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" aria-hidden="true" /> Planning
              </TabsTrigger>
              <TabsTrigger value="rendez-vous" className="flex items-center gap-2">
                <ListTodo className="h-4 w-4" aria-hidden="true" /> Rendez-vous
              </TabsTrigger>
              <TabsTrigger value="personnes" className="flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden="true" /> <span className="sm:hidden">Personnes</span><span className="hidden sm:inline">Personnes à visiter</span>
              </TabsTrigger>
            </TabsList>
            {needsSetup && <SetupCard />}
            {/* Panels stay mounted: switching tabs never loses unsaved work (settings, a proposal on screen). */}
            <TabsContent value="planning" forceMount className="mt-6 data-[state=inactive]:hidden">
              <PlanningTab needsSetup={needsSetup} persons={personOptions} />
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
          </Tabs>
        )}
      </div>
    </div>
  );
}

/**
 * First visit: the agenda needs the MJPM's home (start and end of every tour)
 * and working hours. They are set once in Paramètres › Agenda, like every
 * other setting of Tutellia, not inside the module.
 */
function SetupCard() {
  return (
    <section aria-labelledby="agenda-setup-title" className="mt-4 max-w-3xl rounded-lg border border-agenda-warn bg-agenda-warn-soft p-4">
      <h2 id="agenda-setup-title" className="flex items-center gap-2 text-base font-semibold">
        <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        Avant de commencer : configurez votre agenda
      </h2>
      <p className="mt-1 text-sm text-foreground/80">
        Indiquez votre domicile (le point de départ et d&apos;arrivée de vos tournées), vos jours et
        vos horaires de travail. Cela prend une minute ; vous pourrez les changer à tout moment dans
        les Paramètres.
      </p>
      <Button asChild className="mt-3">
        <Link href={AGENDA_SETTINGS_HREF}>Configurer l&apos;agenda</Link>
      </Button>
    </section>
  );
}

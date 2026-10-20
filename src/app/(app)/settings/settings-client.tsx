"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SmtpConfigForm } from "./smtp-config-form";
import { ModuleConfigTab } from "./module-config-tab";
import { GeneralSettingsTab } from "./general-settings-tab";
import { TemplatesManager } from "./templates-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, FileText, Settings, CreditCard, CalendarDays } from "lucide-react";
import type { SmtpConfigData, ModuleConfigData, TemplateData } from "./actions";

const BASE_TABS = ["general", "smtp", "apa", "ash", "pch", "dernier", "abonnement"];
/** « Agenda » exists only for accounts that hold the add-on. */
const WITH_AGENDA = [...BASE_TABS, "agenda"];

/** ?tab=… selects the tab (links, notifications, guided tours), also after mount. */
function useTabFromUrl(initialTab: string | undefined, tabs: readonly string[]): [string, (tab: string) => void] {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : "general");
  const urlTab = searchParams.get("tab");
  useEffect(() => {
    if (urlTab && tabs.includes(urlTab)) setTab(urlTab);
  }, [urlTab, tabs]);
  return [tab, setTab];
}

interface SettingsPageClientProps {
  initialSmtpConfig: SmtpConfigData;
  initialModuleConfigs: {
    apa: ModuleConfigData;
    ash: ModuleConfigData;
    pch: ModuleConfigData;
  };
  initialApaTemplates: TemplateData[];
  initialAshTemplates: TemplateData[];
  initialPchTemplates: TemplateData[];
  initialDecesTemplates: TemplateData[];
  initialDessaisTemplates: TemplateData[];
  initialSignature: string;
  initialTab?: string;
  billingTab: React.ReactNode;
  /** Set when the user's organisation sends through its shared mailbox. */
  orgMailboxAddress?: string | null;
  /** « Agenda » settings, null when the account has no agenda. */
  agendaTab?: React.ReactNode | null;
}

export function SettingsPageClient({
  initialSmtpConfig,
  initialModuleConfigs,
  initialApaTemplates,
  initialAshTemplates,
  initialPchTemplates,
  initialDecesTemplates,
  initialDessaisTemplates,
  initialSignature,
  initialTab,
  billingTab,
  orgMailboxAddress = null,
  agendaTab = null,
}: SettingsPageClientProps) {
  const [smtpConfig] = useState(initialSmtpConfig);
  const [apaConfig] = useState(initialModuleConfigs.apa);
  const [ashConfig] = useState(initialModuleConfigs.ash);
  const [pchConfig] = useState(initialModuleConfigs.pch);
  const [apaTemplates, setApaTemplates] = useState(initialApaTemplates);
  const [ashTemplates, setAshTemplates] = useState(initialAshTemplates);
  const [pchTemplates, setPchTemplates] = useState(initialPchTemplates);
  const [decesTemplates, setDecesTemplates] = useState(initialDecesTemplates);
  const [dessaisTemplates, setDessaisTemplates] = useState(initialDessaisTemplates);
  const [tab, setTab] = useTabFromUrl(initialTab, agendaTab ? WITH_AGENDA : BASE_TABS);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">Parametres</h2>
          <p className="text-sm text-muted-foreground">
            Configurez vos parametres SMTP et modules
          </p>
        </div>
      </div>

      {/* Content with Tabs */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className={`grid h-auto w-full max-w-5xl grid-cols-2 sm:grid-cols-4 ${agendaTab ? "lg:grid-cols-8" : "lg:grid-cols-7"}`} data-tour="settings-tabs">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Général
            </TabsTrigger>
            <TabsTrigger value="smtp" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              SMTP
            </TabsTrigger>
            <TabsTrigger value="apa" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              APA
            </TabsTrigger>
            <TabsTrigger value="ash" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              ASH
            </TabsTrigger>
            <TabsTrigger value="pch" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              PCH
            </TabsTrigger>
            <TabsTrigger value="dernier" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Dernier
            </TabsTrigger>
            <TabsTrigger value="abonnement" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Abonnement
            </TabsTrigger>
            {agendaTab && (
              <TabsTrigger value="agenda" className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Agenda
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <GeneralSettingsTab initialSignature={initialSignature} />
          </TabsContent>

          <TabsContent value="smtp" className="mt-6">
            <div className="max-w-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-medium">Configuration SMTP</h3>
                <p className="text-sm text-muted-foreground">
                  Configurez votre serveur email pour l&apos;envoi des emails
                </p>
              </div>
              {orgMailboxAddress && (
                <p role="status" className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                  Vos emails partent par la messagerie de votre structure ({orgMailboxAddress}), réglée
                  par son administrateur. La configuration ci-dessous n&apos;est utilisée que si elle est retirée.
                </p>
              )}
              <SmtpConfigForm initialConfig={smtpConfig} />
            </div>
          </TabsContent>

          <TabsContent value="apa" className="mt-6">
            <ModuleConfigTab
              moduleType="APA"
              moduleLabel="APA - Allocation Personnalisee d'Autonomie"
              moduleColor="blue"
              initialConfig={apaConfig}
              initialTemplates={apaTemplates}
              onTemplatesChange={setApaTemplates}
            />
          </TabsContent>

          <TabsContent value="ash" className="mt-6">
            <ModuleConfigTab
              moduleType="ASH"
              moduleLabel="ASH - Aide Sociale a l'Hebergement"
              moduleColor="emerald"
              initialConfig={ashConfig}
              initialTemplates={ashTemplates}
              onTemplatesChange={setAshTemplates}
            />
          </TabsContent>

          <TabsContent value="pch" className="mt-6">
            <ModuleConfigTab
              moduleType="PCH"
              moduleLabel="PCH - Prestation de Compensation du Handicap"
              moduleColor="violet"
              initialConfig={pchConfig}
              initialTemplates={pchTemplates}
              onTemplatesChange={setPchTemplates}
              defaultDestinationEmail="correze-autonomie@correze.fr"
            />
          </TabsContent>

          <TabsContent value="dernier" className="mt-6">
            <div className="space-y-6" data-tour="dernier-templates">
              <TemplatesManager
                templates={decesTemplates}
                onTemplatesChange={setDecesTemplates}
                title="Modèles — Fin de mesure (Décès)"
                defaultCategory="DERNIER_DECES"
              />
              <TemplatesManager
                templates={dessaisTemplates}
                onTemplatesChange={setDessaisTemplates}
                title="Modèles — Fin de mesure (Dessaisissement)"
                defaultCategory="DERNIER_DESSAISISSEMENT"
              />
            </div>
          </TabsContent>
          <TabsContent value="abonnement" className="mt-6">
            {billingTab}
          </TabsContent>
          {agendaTab && (
            <TabsContent value="agenda" className="mt-6">
              {agendaTab}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

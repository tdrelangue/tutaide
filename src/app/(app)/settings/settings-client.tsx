"use client";

import { useState } from "react";
import { SmtpConfigForm } from "./smtp-config-form";
import { ModuleConfigTab } from "./module-config-tab";
import { GeneralSettingsTab } from "./general-settings-tab";
import { TemplatesManager } from "./templates-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, FileText, Settings } from "lucide-react";
import type { SmtpConfigData, ModuleConfigData, TemplateData } from "./actions";

interface SettingsPageClientProps {
  initialSmtpConfig: SmtpConfigData;
  initialModuleConfigs: {
    apa: ModuleConfigData;
    ash: ModuleConfigData;
  };
  initialApaTemplates: TemplateData[];
  initialAshTemplates: TemplateData[];
  initialDecesTemplates: TemplateData[];
  initialDessaisTemplates: TemplateData[];
  initialSignature: string;
}

export function SettingsPageClient({
  initialSmtpConfig,
  initialModuleConfigs,
  initialApaTemplates,
  initialAshTemplates,
  initialDecesTemplates,
  initialDessaisTemplates,
  initialSignature,
}: SettingsPageClientProps) {
  const [smtpConfig] = useState(initialSmtpConfig);
  const [apaConfig] = useState(initialModuleConfigs.apa);
  const [ashConfig] = useState(initialModuleConfigs.ash);
  const [apaTemplates, setApaTemplates] = useState(initialApaTemplates);
  const [ashTemplates, setAshTemplates] = useState(initialAshTemplates);
  const [decesTemplates, setDecesTemplates] = useState(initialDecesTemplates);
  const [dessaisTemplates, setDessaisTemplates] = useState(initialDessaisTemplates);

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
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
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
            <TabsTrigger value="dernier" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Dernier
            </TabsTrigger>
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

          <TabsContent value="dernier" className="mt-6">
            <div className="space-y-6">
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
        </Tabs>
      </div>
    </div>
  );
}

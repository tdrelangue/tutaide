import { Suspense } from "react";
import {
  getSmtpConfig,
  getAllModuleConfigs,
  getTemplatesByCategory,
  getSignature,
} from "./actions";
import { SettingsPageClient } from "./settings-client";

export default async function SettingsPage() {
  const [smtpConfig, moduleConfigs, apaTemplates, ashTemplates, signature] =
    await Promise.all([
      getSmtpConfig(),
      getAllModuleConfigs(),
      getTemplatesByCategory("APA"),
      getTemplatesByCategory("ASH"),
      getSignature(),
    ]);

  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsPageClient
        initialSmtpConfig={smtpConfig}
        initialModuleConfigs={moduleConfigs}
        initialApaTemplates={apaTemplates}
        initialAshTemplates={ashTemplates}
        initialSignature={signature}
      />
    </Suspense>
  );
}

function SettingsLoading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/4 bg-muted rounded" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

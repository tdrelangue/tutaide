import { Suspense } from "react";
import { getSystemConfig, getUpdaterSettings } from "../actions";
import { SystemConfigForm } from "./system-config-form";
import { UpdateEndpointForm } from "./update-endpoint-form";

export default async function SystemConfigPage() {
  const [config, updaterSettings] = await Promise.all([getSystemConfig(), getUpdaterSettings()]);

  return (
    <Suspense fallback={<SystemConfigLoading />}>
      <SystemConfigPageClient config={config} updaterSettings={updaterSettings} />
    </Suspense>
  );
}

function SystemConfigPageClient({
  config,
  updaterSettings,
}: {
  config: Awaited<ReturnType<typeof getSystemConfig>>;
  updaterSettings: Awaited<ReturnType<typeof getUpdaterSettings>>;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h2 className="text-xl font-semibold tracking-tight">Configuration système</h2>
        <p className="text-sm text-muted-foreground">
          Réglages communs à toutes les installations : emails de récupération de mot de passe
          et adresse des mises à jour.
        </p>
      </div>
      <div className="p-6 max-w-2xl space-y-8">
        <section aria-labelledby="smtp-recovery-heading" className="space-y-3">
          <div>
            <h3 id="smtp-recovery-heading" className="text-lg font-medium">Récupération de mot de passe</h3>
            <p className="text-sm text-muted-foreground">
              Compte SMTP unique utilisé pour envoyer les emails de réinitialisation de mot de passe à
              tous les utilisateurs.
            </p>
          </div>
          <SystemConfigForm initialConfig={config} />
        </section>
        <UpdateEndpointForm settings={updaterSettings} />
      </div>
    </div>
  );
}

function SystemConfigLoading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/3 bg-muted rounded" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

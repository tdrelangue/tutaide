import { Suspense } from "react";
import { getSystemConfig } from "../actions";
import { SystemConfigForm } from "./system-config-form";

export default async function SystemConfigPage() {
  const config = await getSystemConfig();

  return (
    <Suspense fallback={<SystemConfigLoading />}>
      <SystemConfigPageClient config={config} />
    </Suspense>
  );
}

function SystemConfigPageClient({
  config,
}: {
  config: Awaited<ReturnType<typeof getSystemConfig>>;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Configuration SMTP — récupération de mot de passe
        </h2>
        <p className="text-sm text-muted-foreground">
          Compte SMTP unique utilisé pour envoyer les emails de réinitialisation de
          mot de passe à tous les utilisateurs.
        </p>
      </div>
      <div className="p-6 max-w-2xl">
        <SystemConfigForm initialConfig={config} />
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

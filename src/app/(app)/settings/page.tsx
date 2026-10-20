import { Suspense } from "react";
import {
  getSmtpConfig,
  getAllModuleConfigs,
  getTemplatesByCategory,
  getSignature,
} from "./actions";
import { SettingsPageClient } from "./settings-client";
import { BillingTab } from "./billing-tab";
import { getEffectiveUserId } from "@/lib/auth";
import { getOrgSmtpFor } from "@/lib/access/org-mail";
import { loadAgendaSettingsTab } from "./agenda-settings-tab";

type SearchParams = Promise<{ tab?: string; checkout?: string; session_id?: string }>;

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { tab, checkout, session_id: sessionId } = await searchParams;
  const userId = await getEffectiveUserId();
  const orgMailbox = userId ? await getOrgSmtpFor(userId) : null;
  const [smtpConfig, moduleConfigs, apaTemplates, ashTemplates, pchTemplates, decesTemplates, dessaisTemplates, signature, agendaTab] =
    await Promise.all([
      getSmtpConfig(),
      getAllModuleConfigs(),
      getTemplatesByCategory("APA"),
      getTemplatesByCategory("ASH"),
      getTemplatesByCategory("PCH"),
      getTemplatesByCategory("DERNIER_DECES"),
      getTemplatesByCategory("DERNIER_DESSAISISSEMENT"),
      getSignature(),
      loadAgendaSettingsTab(),
    ]);

  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsPageClient
        initialSmtpConfig={smtpConfig}
        initialModuleConfigs={moduleConfigs}
        initialApaTemplates={apaTemplates}
        initialAshTemplates={ashTemplates}
        initialPchTemplates={pchTemplates}
        initialDecesTemplates={decesTemplates}
        initialDessaisTemplates={dessaisTemplates}
        initialSignature={signature}
        initialTab={tab}
        orgMailboxAddress={orgMailbox?.fromEmail ?? null}
        agendaTab={agendaTab}
        billingTab={
          <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement de l&apos;abonnement…</p>}>
            <BillingTab checkout={checkout} sessionId={sessionId} fresh={tab === "abonnement"} />
          </Suspense>
        }
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

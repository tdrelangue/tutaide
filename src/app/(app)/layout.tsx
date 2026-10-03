import { redirect } from "next/navigation";
import { auth, getImpersonationState } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { UpdaterStartupCheck } from "@/components/updater";
import { getAllModuleConfigs } from "@/app/(app)/settings/actions";
import { migrateLegacyLinkedDossiers } from "@/lib/legacy-migrations";
import { getPaymentReminder, isBlockedByPaywall } from "@/lib/billing";
import { ensureDailyPaymentReminder } from "@/lib/notifications";
import { PaymentReminderCard } from "@/components/payment-reminder-card";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // New accounts must finish their first payment. Admins and accounts created
  // before billing launched are never blocked (see lib/billing.ts).
  if (await isBlockedByPaywall(session.user.id)) {
    redirect("/abonnement");
  }

  // 30-day payment grace (failed charge, or first charge date passed without a
  // card): still full access, but a daily bell reminder and a card on screen.
  const paymentReminder = await getPaymentReminder(session.user.id);
  if (paymentReminder) {
    await ensureDailyPaymentReminder(session.user.id, paymentReminder).catch(() => undefined);
  }

  const [impersonation, moduleConfigs] = await Promise.all([
    getImpersonationState(),
    getAllModuleConfigs(),
  ]);

  // Heal any dossier links written by an older app build still on the
  // legacy linkedDossierId mechanism into the current groupId model.
  await migrateLegacyLinkedDossiers(session.user.id);

  const activeModuleKeys = (Object.entries(moduleConfigs) as [string, unknown][])
    .filter(([, config]) => config !== null)
    .map(([key]) => key);

  return (
    <div className="flex min-h-screen flex-col">
      <UpdaterStartupCheck />
      {paymentReminder && <PaymentReminderCard reminder={paymentReminder} />}
      {impersonation && (
        <ImpersonationBanner
          targetEmail={impersonation.targetEmail}
          targetName={impersonation.targetName}
        />
      )}
      <div className="flex flex-1">
        <AppSidebar userRole={session.user.role} activeModules={activeModuleKeys} />
        <div className="flex flex-1 flex-col">
          <AppHeader user={session.user} />
          <main id="main-content" className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

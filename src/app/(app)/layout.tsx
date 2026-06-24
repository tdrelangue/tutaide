import { redirect } from "next/navigation";
import { auth, getImpersonationState } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { UpdaterStartupCheck } from "@/components/updater";
import { getAllModuleConfigs } from "@/app/(app)/settings/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const [impersonation, moduleConfigs] = await Promise.all([
    getImpersonationState(),
    getAllModuleConfigs(),
  ]);

  const activeModuleKeys = (Object.entries(moduleConfigs) as [string, unknown][])
    .filter(([, config]) => config !== null)
    .map(([key]) => key);

  return (
    <div className="flex min-h-screen flex-col">
      <UpdaterStartupCheck />
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

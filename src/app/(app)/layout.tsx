import { redirect } from "next/navigation";
import { auth, getImpersonationState } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { ImpersonationBanner } from "@/components/impersonation-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const impersonation = await getImpersonationState();

  return (
    <div className="flex min-h-screen flex-col">
      {impersonation && (
        <ImpersonationBanner
          targetEmail={impersonation.targetEmail}
          targetName={impersonation.targetName}
        />
      )}
      <div className="flex flex-1">
        <AppSidebar userRole={session.user.role} />
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

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Payment step: signed in, but outside the app shell (which would redirect here). */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      {children}
    </main>
  );
}

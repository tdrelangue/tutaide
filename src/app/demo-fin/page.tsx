"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";

/**
 * Reached with a demo session whose demo no longer exists (the app was closed
 * during a demo): signs out and returns to the login page.
 */
export default function DemoEndedPage() {
  useEffect(() => {
    void signOut({ callbackUrl: "/login" });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">La démonstration est terminée. Retour à la connexion…</p>
    </main>
  );
}

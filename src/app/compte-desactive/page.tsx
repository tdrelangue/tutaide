"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";

/**
 * Reached with a session whose account was archived since login (e.g. by the
 * organisation admin): explains, signs out and returns to the login page.
 */
export default function AccountDisabledPage() {
  useEffect(() => {
    const timer = setTimeout(() => void signOut({ callbackUrl: "/login" }), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-medium">Ce compte a été désactivé.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Votre accès a été retiré par l&apos;administrateur de votre structure. Contactez-le si
        vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
      </p>
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Déconnexion en cours" />
    </main>
  );
}

"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * Reached with a session whose account was archived since login (e.g. by the
 * organisation admin). Access is already refused everywhere; the person signs
 * out when they have read the message (no timer).
 */
export default function AccountDisabledPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold">Ce compte a été désactivé</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Votre accès a été retiré par l&apos;administrateur de votre structure. Contactez-le si vous
        pensez qu&apos;il s&apos;agit d&apos;une erreur.
      </p>
      <Button onClick={() => void signOut({ callbackUrl: "/login" })}>Retourner à la connexion</Button>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const AUTO_RECHECK_MS = 4000;

/**
 * After Stripe redirects back, re-runs the server check once automatically,
 * then lets the user retry by hand (no endless spinner, no countdown).
 */
export function RecheckButton() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      router.refresh();
      setIsChecking(false);
    }, AUTO_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [router]);

  function handleRecheck() {
    setIsChecking(true);
    router.refresh();
    setTimeout(() => setIsChecking(false), AUTO_RECHECK_MS);
  }

  return (
    <div className="space-y-3">
      <p role="status" className="text-sm">
        {isChecking ? "Vérification en cours…" : "Le paiement n'est pas encore confirmé."}
      </p>
      <Button type="button" onClick={handleRecheck} disabled={isChecking}>
        {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Vérifier à nouveau
      </Button>
    </div>
  );
}

export function SignOutLink() {
  function handleSignOut() {
    signOut({ callbackUrl: "/login" });
  }

  return (
    <Button type="button" variant="link" className="h-auto p-0 text-muted-foreground" onClick={handleSignOut}>
      Se déconnecter
    </Button>
  );
}

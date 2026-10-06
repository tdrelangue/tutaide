"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startDemoAction } from "@/lib/demo/actions";

/** "Tester l'application": a throwaway demo account with fictional data. */
export function DemoEntry() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    setIsStarting(true);
    try {
      const demo = await startDemoAction();
      if (!demo.success) {
        toast.error(demo.error);
        return;
      }
      const result = await signIn("credentials", { email: demo.email, password: demo.password, redirect: false });
      if (result?.error) {
        toast.error("La démonstration n'a pas pu démarrer. Réessayez.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("La démonstration n'a pas pu démarrer. Réessayez.");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border bg-muted/40 p-4 text-center" aria-labelledby="demo-entry-title">
      <h2 id="demo-entry-title" className="text-sm font-semibold">Découvrir Tutellia sans compte</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Des dossiers fictifs, toutes les fonctions. Aucun email n&apos;est envoyé et rien n&apos;est conservé.
      </p>
      <Button variant="outline" className="mt-3 w-full" onClick={handleStart} disabled={isStarting}>
        {isStarting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {isStarting ? "Préparation de la démonstration…" : "Tester l'application"}
      </Button>
    </section>
  );
}

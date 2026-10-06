"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { FlaskConical, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { endDemoAction } from "@/lib/demo/actions";

/** Always visible during a demo, so nobody mistakes it for a real account. */
export function DemoBanner() {
  const [isLeaving, setIsLeaving] = useState(false);

  async function handleLeave() {
    setIsLeaving(true);
    await endDemoAction();
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b bg-primary px-4 py-2 text-sm text-primary-foreground" role="status">
      <span className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
        <strong>Mode démonstration</strong>
        <span className="opacity-90">Données fictives : aucun email n&apos;est envoyé, rien n&apos;est conservé.</span>
      </span>
      <Button size="sm" variant="secondary" className="h-7" onClick={handleLeave} disabled={isLeaving}>
        {isLeaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
        Quitter la démo
      </Button>
    </div>
  );
}

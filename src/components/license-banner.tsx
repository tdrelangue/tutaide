import { AlertTriangle } from "lucide-react";

/** Organisation server whose licence OrigAI reports as inactive (never blocks). */
export function LicenseBanner() {
  return (
    <div role="alert" className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      La licence Tutellia de ce serveur n&apos;est pas active. Prévenez l&apos;administrateur de votre
      structure, qui contactera OrigAI.
    </div>
  );
}

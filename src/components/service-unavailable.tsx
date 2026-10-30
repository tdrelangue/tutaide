"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** One retry every 10 s for 2 minutes, then only the button (no endless background load). */
const RETRY_EVERY_S = 10;
const MAX_AUTO_RETRIES = 12;

type Props = {
  /** Retries the failed render (Next error boundary `reset`, or a full reload). */
  onRetry: () => void;
  /** Server reference of the error, for support. */
  digest?: string;
};

/**
 * Shown instead of a blank « Application error » page when the server cannot
 * answer (most often: the database is briefly unavailable). It says what is
 * happening, keeps trying on its own, and lets the user retry at once.
 * Plain elements only: it must render even when the app's own layout failed.
 */
export function ServiceUnavailable({ onRetry, digest }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(RETRY_EVERY_S);
  const [attempts, setAttempts] = useState(0);
  const isAuto = attempts < MAX_AUTO_RETRIES;

  useEffect(() => {
    if (!isAuto) return;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [isAuto]);

  useEffect(() => {
    if (!isAuto || secondsLeft > 0) return;
    setAttempts((a) => a + 1);
    setSecondsLeft(RETRY_EVERY_S);
    onRetry();
  }, [isAuto, secondsLeft, onRetry]);

  return (
    <div role="alert" aria-live="polite" className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-semibold">Service momentanément indisponible</h1>
      <p className="text-sm text-muted-foreground">
        Tutellia n&apos;arrive pas à afficher cette page pour le moment (le plus souvent, le serveur est brièvement surchargé). Vos données ne sont pas perdues et rien
        n&apos;a été modifié. Cela se résout généralement en quelques instants.
      </p>
      {isAuto ? (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Nouvelle tentative automatique dans {secondsLeft} s…
        </p>
      ) : (
        <p className="text-sm">
          Le problème persiste. Réessayez dans quelques minutes ; s&apos;il continue, contactez le support OrigAI.
        </p>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Réessayer maintenant
      </button>
      {digest && <p className="text-xs text-muted-foreground">Référence pour le support : <span className="font-mono">{digest}</span></p>}
    </div>
  );
}

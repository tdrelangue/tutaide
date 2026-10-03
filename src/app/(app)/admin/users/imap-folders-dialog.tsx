"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Folder, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImapInspection } from "@/lib/imap-inspect";
import { inspectUserImapAction } from "../actions";

const SPECIAL_USE_LABELS: Record<string, string> = {
  "\\Inbox": "Réception",
  "\\Sent": "Envoyés",
  "\\Drafts": "Brouillons",
  "\\Trash": "Corbeille",
  "\\Junk": "Indésirables",
  "\\Archive": "Archives",
  "\\All": "Tous les messages",
  "\\Flagged": "Suivis",
};

/**
 * Support tool: the user's mailbox folder tree, read with the SMTP credentials
 * they saved. Folder names only; no email is ever read.
 */
export function ImapFoldersDialog({
  userId,
  userLabel,
  open,
  onOpenChange,
}: {
  userId: string;
  userLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<ImapInspection | null>(null);
  const [host, setHost] = useState("");
  const [loading, setLoading] = useState(false);

  const inspect = useCallback(
    async (override?: string) => {
      setLoading(true);
      const res = await inspectUserImapAction(userId, override);
      setResult(res);
      if (res.host) setHost(res.host);
      setLoading(false);
    },
    [userId]
  );

  useEffect(() => {
    if (open) inspect();
  }, [open, inspect]);

  function handleRetry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    inspect(host);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dossiers de la messagerie</DialogTitle>
          <DialogDescription>
            {userLabel}. Lecture des noms de dossiers uniquement, avec les identifiants SMTP enregistrés
            par l&apos;utilisateur. Aucun email n&apos;est lu.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleRetry} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="imap-host">Serveur IMAP (port 993)</Label>
            <Input id="imap-host" value={host} onChange={(e) => setHost(e.target.value)} disabled={loading} placeholder="ssl0.ovh.net" />
          </div>
          <Button type="submit" variant="outline" disabled={loading || !host.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Réessayer
          </Button>
        </form>

        <div aria-live="polite" className="max-h-[55vh] overflow-y-auto space-y-4">
          {loading && !result && <p role="status" className="text-sm text-muted-foreground">Connexion à la messagerie…</p>}

          {result && !result.ok && (
            <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{result.error}</p>
          )}

          {result?.ok && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Compte</dt>
                <dd>{result.username}</dd>
                <dt className="text-muted-foreground">Préfixe</dt>
                <dd>{result.prefix ? <code>{result.prefix}</code> : "aucun (dossiers à la racine)"}</dd>
                <dt className="text-muted-foreground">Séparateur</dt>
                <dd><code>{result.delimiter}</code> (ex. <code>{`INBOX${result.delimiter}APA`}</code>)</dd>
              </dl>

              {result.modules.length > 0 && (
                <section aria-labelledby="imap-modules" className="space-y-1">
                  <h3 id="imap-modules" className="text-sm font-medium">Dossiers configurés dans Tutellia</h3>
                  <ul className="space-y-1 text-sm">
                    {result.modules.map((m) => (
                      <li key={m.module} className="flex items-center gap-2">
                        {m.exists
                          ? <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />
                          : <XCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                        <span className="font-medium">{m.module}</span>
                        <code>{m.folder}</code>
                        <span className="text-muted-foreground">
                          {m.exists ? "existe" : "n'existe pas (Tutellia tentera de le créer au premier envoi)"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="imap-tree" className="space-y-1">
                <h3 id="imap-tree" className="text-sm font-medium">Arborescence ({result.folders.length} dossiers)</h3>
                <ul className="text-sm">
                  {result.folders.map((f) => (
                    <li key={f.path} className="flex items-center gap-2 py-0.5" style={{ paddingLeft: `${f.depth * 1.25}rem` }}>
                      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span>{f.name}</span>
                      <code className="text-xs text-muted-foreground">{f.path}</code>
                      {f.specialUse && SPECIAL_USE_LABELS[f.specialUse] && (
                        <Badge variant="secondary" className="text-xs">{SPECIAL_USE_LABELS[f.specialUse]}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

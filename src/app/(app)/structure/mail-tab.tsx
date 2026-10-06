"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrgOverview } from "@/lib/organizations/overview";
import { SmtpConfigForm } from "../settings/smtp-config-form";
import { removeStructureSmtp, saveStructureDestination, saveStructureSmtp } from "./actions";
import { InlineError, useStructureAction } from "./use-structure-action";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ModuleKey = "APA" | "ASH" | "PCH";
const MODULES: ModuleKey[] = ["APA", "ASH", "PCH"];

type Props = { smtp: OrgOverview["smtp"]; destinations: OrgOverview["destinations"] };

export function MailTab({ smtp, destinations }: Props) {
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Une fois la messagerie de la structure enregistrée, tous les membres envoient par elle, avec
        la signature du mandataire du dossier. Sans elle, chacun utilise sa propre messagerie.
      </p>
      <SmtpConfigForm initialConfig={smtp} saveAction={saveStructureSmtp} title="Messagerie de la structure" />
      {smtp && <RemoveMailboxButton address={smtp.fromEmail} />}
      <Card>
        <CardHeader>
          <CardTitle>Destinataires par module</CardTitle>
          <CardDescription>
            Adresse de l&apos;organisme destinataire de chaque module, commune à toute la structure.
            Laissez vide pour que chacun utilise son propre réglage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {MODULES.map((moduleType) => (
            <DestinationRow key={moduleType} moduleType={moduleType} current={destinations.find((d) => d.moduleType === moduleType)} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Removing the shared mailbox changes how every member sends: confirm first. */
function RemoveMailboxButton({ address }: { address: string }) {
  const { run, isBusy, error, clearError } = useStructureAction();
  const [isOpen, setIsOpen] = useState(false);

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (await run(removeStructureSmtp)) setIsOpen(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => { clearError(); setIsOpen(true); }}>
        Ne plus utiliser la messagerie de la structure
      </Button>
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ne plus envoyer par {address} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Chaque membre enverra de nouveau avec sa propre messagerie (Paramètres → SMTP). Ceux
              qui n&apos;en ont pas configuré ne pourront plus envoyer d&apos;emails. Pour revenir en
              arrière, il faudra ressaisir les réglages, mot de passe compris.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <InlineError message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Garder la messagerie de la structure</AlertDialogCancel>
            <AlertDialogAction disabled={isBusy} onClick={handleConfirm}>Retirer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type RowProps = { moduleType: ModuleKey; current?: OrgOverview["destinations"][number] };

function DestinationRow({ moduleType, current }: RowProps) {
  const { run, isBusy } = useStructureAction();
  const [email, setEmail] = useState(current?.destinationEmail ?? "");
  const [folder, setFolder] = useState(current?.imapFolder ?? "");

  return (
    <form
      className="grid gap-2 sm:grid-cols-[4rem_1fr_10rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveStructureDestination(moduleType, email, folder));
      }}
    >
      <p className="font-medium sm:pb-2">{moduleType}</p>
      <div className="space-y-1">
        <Label htmlFor={`dest-${moduleType}`}>Email de l&apos;organisme</Label>
        <Input id={`dest-${moduleType}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`folder-${moduleType}`}>Dossier IMAP</Label>
        <Input id={`folder-${moduleType}`} value={folder} placeholder={`INBOX/${moduleType}`} onChange={(e) => setFolder(e.target.value)} />
      </div>
      <Button type="submit" variant="outline" disabled={isBusy}>Enregistrer</Button>
    </form>
  );
}

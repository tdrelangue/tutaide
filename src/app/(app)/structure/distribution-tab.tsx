"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { MemberRow } from "@/lib/organizations/overview";
import { assignAssistants, moveAssistantWork, transferDossiers } from "./actions";
import { InlineError, useStructureAction } from "./use-structure-action";

type Assignment = { assistantId: string; mandataireId: string };
type Props = { members: MemberRow[]; assignments: Assignment[] };

export function DistributionTab({ members, assignments }: Props) {
  const active = members.filter((m) => !m.archived);
  const mandataires = active.filter((m) => m.orgRole === "MANDATAIRE");
  const assistants = active.filter((m) => m.orgRole === "ASSISTANT");

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Qui s&apos;occupe de chaque mandataire</CardTitle>
          <CardDescription>
            Cochez les assistant(e)s qui gèrent les dossiers de chaque mandataire. Chaque changement
            est enregistré aussitôt ; décochez pour revenir en arrière.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mandataires.length === 0 && <p className="text-sm text-muted-foreground">Aucun mandataire dans la structure.</p>}
          {assistants.length === 0 && mandataires.length > 0 && (
            <p className="text-sm text-muted-foreground">Aucun(e) assistant(e) : ajoutez-en dans l&apos;onglet Membres.</p>
          )}
          {assistants.length > 0 &&
            mandataires.map((mandataire) => (
              <MandataireRow key={mandataire.id} mandataire={mandataire} assistants={assistants} assignments={assignments} />
            ))}
        </CardContent>
      </Card>
      <MoveAssistantCard members={members} assistants={assistants} assignments={assignments} />
      <TransferDossiersCard members={members} mandataires={mandataires} />
    </div>
  );
}

function MandataireRow({ mandataire, assistants, assignments }: { mandataire: MemberRow; assistants: MemberRow[]; assignments: Assignment[] }) {
  const { run, isBusy } = useStructureAction();
  const current = assignments.filter((a) => a.mandataireId === mandataire.id).map((a) => a.assistantId);

  function toggle(assistantId: string) {
    if (isBusy) return;
    const next = current.includes(assistantId) ? current.filter((id) => id !== assistantId) : [...current, assistantId];
    void run(() => assignAssistants(mandataire.id, next), "Répartition enregistrée");
  }

  return (
    <div className="rounded-md border p-3">
      <p className="font-medium">
        {mandataire.name} <span className="text-sm font-normal text-muted-foreground">· {mandataire.dossierCount} dossier(s)</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Assistant(e)s de ${mandataire.name}`}>
        {assistants.map((assistant) => {
          const isOn = current.includes(assistant.id);
          return (
            // aria-disabled (not disabled): keyboard focus stays on the toggle while saving.
            <Button key={assistant.id} size="sm" variant={isOn ? "default" : "outline"} aria-pressed={isOn} aria-disabled={isBusy} onClick={() => toggle(assistant.id)}>
              {assistant.name}
            </Button>
          );
        })}
      </div>
      {current.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Personne n&apos;est affecté : seul le mandataire voit ses dossiers.</p>}
    </div>
  );
}

type PersonSelectProps = { id: string; label: string; people: MemberRow[]; value: string; onChange: (v: string) => void };

function PersonSelect({ id, label, people, value, onChange }: PersonSelectProps) {
  return (
    <div className="min-w-48 flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue placeholder="Choisir" /></SelectTrigger>
        <SelectContent>
          {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.archived ? " (archivé)" : ""}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

type MoveProps = { members: MemberRow[]; assistants: MemberRow[]; assignments: Assignment[] };

function MoveAssistantCard({ members, assistants, assignments }: MoveProps) {
  const sources = members.filter((m) => assignments.some((a) => a.assistantId === m.id));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const count = assignments.filter((a) => a.assistantId === from).length;
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  return (
    <TransferCard
      title="Un(e) assistant(e) s'absente ou part"
      description="Tous les mandataires qu'il ou elle gère passent à un(e) autre assistant(e), qui garde aussi les siens."
      from={<PersonSelect id="move-from" label="Assistant(e) qui part" people={sources} value={from} onChange={setFrom} />}
      to={<PersonSelect id="move-to" label="Reprend ses mandataires" people={assistants.filter((a) => a.id !== from)} value={to} onChange={setTo} />}
      isReady={Boolean(from && to) && count > 0}
      buttonLabel={from && to ? `Réattribuer les ${count} mandataire(s) de ${name(from)} à ${name(to)}` : "Réattribuer"}
      confirmLabel={`Réattribuer ${count} mandataire(s)`}
      confirmText={`Mandataires concernés : ${assignments.filter((a) => a.assistantId === from).map((a) => name(a.mandataireId)).join(", ")}. Ils seront gérés par ${name(to)}, qui garde aussi les siens, et plus par ${name(from)}. Pour revenir en arrière : Journal → Annuler (rétablit exactement la répartition d'avant).`}
      onConfirm={() => moveAssistantWork(from, to)}
      onDone={() => { setFrom(""); setTo(""); }}
    />
  );
}

function TransferDossiersCard({ members, mandataires }: { members: MemberRow[]; mandataires: MemberRow[] }) {
  const sources = members.filter((m) => m.orgRole === "MANDATAIRE" && m.dossierCount > 0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const source = members.find((m) => m.id === from);
  const target = members.find((m) => m.id === to);

  return (
    <TransferCard
      title="Un mandataire part"
      description="Tous ses dossiers (avec leurs documents et leur historique d'envoi) passent à un autre mandataire de la structure."
      from={<PersonSelect id="transfer-from" label="Mandataire qui part" people={sources} value={from} onChange={setFrom} />}
      to={<PersonSelect id="transfer-to" label="Reprend ses dossiers" people={mandataires.filter((m) => m.id !== from)} value={to} onChange={setTo} />}
      isReady={Boolean(source && target)}
      buttonLabel={source && target ? `Transférer les ${source.dossierCount} dossier(s) de ${source.name} à ${target.name}` : "Transférer"}
      confirmLabel={`Transférer ${source?.dossierCount ?? 0} dossier(s)`}
      confirmText={`Les ${source?.dossierCount ?? 0} dossier(s) de ${source?.name ?? ""} (avec leurs documents et leur historique) appartiendront à ${target?.name ?? ""}. Pour revenir en arrière : Journal → Annuler (seuls ces dossiers-là reviennent ; ceux de ${target?.name ?? ""} ne bougent pas).`}
      onConfirm={() => transferDossiers(from, to)}
      onDone={() => { setFrom(""); setTo(""); }}
    />
  );
}

type TransferCardProps = {
  title: string;
  description: string;
  from: React.ReactNode;
  to: React.ReactNode;
  isReady: boolean;
  buttonLabel: string;
  confirmLabel: string;
  confirmText: string;
  onConfirm: () => Promise<import("./actions").ActionResult>;
  onDone: () => void;
};

function TransferCard(props: TransferCardProps) {
  const { run, isBusy, error, clearError } = useStructureAction();
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault(); // keep the dialog open on failure, to show why
    if (await run(props.onConfirm)) {
      props.onDone();
      setIsConfirming(false);
    }
  }

  function openConfirm() {
    clearError();
    setIsConfirming(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          {props.from}
          <ArrowRight className="mb-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {props.to}
        </div>
        <Button variant="outline" disabled={!props.isReady || isBusy} onClick={openConfirm}>
          {props.buttonLabel}
        </Button>
      </CardContent>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{props.title} : confirmer</AlertDialogTitle>
            <AlertDialogDescription>{props.confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <InlineError message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={isBusy} onClick={handleConfirm}>{props.confirmLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

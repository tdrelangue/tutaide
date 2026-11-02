"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { readContactRows, type FileContact } from "@/lib/agenda/contacts-file";
import type { ImportConflict, ImportReport } from "@/lib/agenda/contacts-import";
import { ERROR_TEXT } from "./address-field";
import { findAgendaFileConflicts, importAgendaPersonsFromFile } from "./actions";
import { ImportConflicts } from "./import-conflicts";

/** An export of a caseload is well under 1 MB; anything far bigger is not one. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ".xls,.xlsx,.ods,.csv";

type Step =
  | { kind: "choose"; error: string | null }
  | { kind: "reading" }
  | { kind: "ready"; fileName: string; contacts: FileContact[]; deceased: number; conflicts: ImportConflict[] }
  | { kind: "importing"; count: number }
  | { kind: "done"; report: ImportReport };

/** First sheet of the file -> rows, read in the browser (the file itself is never sent). */
async function readFileRows(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
}

export function ContactsFileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "choose", error: null });
  const [isDragging, setIsDragging] = useState(false);
  /** Lines of the file whose address / phone replace the agenda's (none by default). */
  const [replace, setReplace] = useState<ReadonlySet<number>>(new Set());
  const isBusy = step.kind === "reading" || step.kind === "importing";

  async function readFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setStep({ kind: "choose", error: "Ce fichier est trop volumineux pour être une liste de personnes." });
      return;
    }
    setStep({ kind: "reading" });
    try {
      const result = readContactRows(await readFileRows(file));
      if (!result.ok) {
        setStep({ kind: "choose", error: result.error });
        return;
      }
      // Who is already in the agenda with something else: asked before anything is written.
      const found = await findAgendaFileConflicts(result.contacts);
      if (!found.success) {
        setStep({ kind: "choose", error: found.error });
        return;
      }
      setReplace(new Set());
      setStep({ kind: "ready", fileName: file.name, contacts: result.contacts, deceased: result.deceased, conflicts: found.conflicts });
    } catch {
      setStep({ kind: "choose", error: "Ce fichier n'a pas pu être lu. Utilisez un fichier Excel (.xls, .xlsx), OpenDocument (.ods) ou CSV." });
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void readFile(file);
  }

  function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !isBusy) void readFile(file);
  }

  async function handleImport() {
    if (step.kind !== "ready") return;
    const { contacts } = step;
    setStep({ kind: "importing", count: contacts.length });
    try {
      const result = await importAgendaPersonsFromFile(contacts, [...replace]);
      if (!result.success) {
        setStep(step);
        toast.error(result.error);
        return;
      }
      setStep({ kind: "done", report: result.report });
      router.refresh();
    } catch {
      setStep(step);
      toast.error("Erreur inattendue. Réessayez ; si cela persiste, contactez le support OrigAI.");
    }
  }

  function handleOpenChange(next: boolean) {
    if (isBusy) return;
    if (!next) setStep({ kind: "choose", error: null });
    onOpenChange(next);
  }

  function handleRestart() {
    setStep({ kind: "choose", error: null });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importer une liste de personnes</DialogTitle>
          <DialogDescription>
            L&apos;export « Adresses » de votre logiciel métier (Proxima…), tel quel. Seuls le nom, l&apos;adresse et le
            téléphone sont importés : le numéro de sécurité sociale et les autres informations restent sur votre ordinateur.
          </DialogDescription>
        </DialogHeader>

        <div aria-live="polite">
          {(step.kind === "choose" || step.kind === "reading") && (
            <DropZone isDragging={isDragging} isReading={step.kind === "reading"} error={step.kind === "choose" ? step.error : null} onChange={handleInputChange} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} />
          )}
          {step.kind === "ready" && (
            <div className="space-y-3">
              <Preview fileName={step.fileName} contacts={step.contacts} deceased={step.deceased} />
              {step.conflicts.length > 0 && <ImportConflicts conflicts={step.conflicts} replace={replace} onChange={setReplace} />}
            </div>
          )}
          {step.kind === "importing" && (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Import de {step.count} personnes et recherche de leurs adresses… cela peut prendre une minute.
            </p>
          )}
          {step.kind === "done" && <Report report={step.report} />}
        </div>

        <DialogFooter>
          {step.kind === "ready" && (
            <>
              <Button type="button" variant="outline" onClick={handleRestart}>Choisir un autre fichier</Button>
              <Button type="button" onClick={handleImport}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Importer {step.contacts.length} personne{step.contacts.length > 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step.kind === "done" && <Button type="button" onClick={() => handleOpenChange(false)}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DropZoneProps = {
  isDragging: boolean;
  isReading: boolean;
  error: string | null;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLLabelElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLLabelElement>) => void;
};

function DropZone({ isDragging, isReading, error, onChange, onDragOver, onDragLeave, onDrop }: DropZoneProps) {
  return (
    <div className="space-y-2">
      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm transition-colors",
          "focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50",
          isDragging && "border-primary bg-primary/5",
        )}
      >
        {isReading
          ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          : <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        <span className="font-medium">{isReading ? "Lecture du fichier…" : "Déposez le fichier ici"}</span>
        {!isReading && <span className="text-muted-foreground">ou cliquez pour le choisir (.xls, .xlsx, .ods, .csv)</span>}
        <input type="file" accept={ACCEPTED} onChange={onChange} disabled={isReading} className="sr-only" />
      </label>
      {error && <p role="alert" className={ERROR_TEXT}>{error}</p>}
    </div>
  );
}

function Preview({ fileName, contacts, deceased }: { fileName: string; contacts: FileContact[]; deceased: number }) {
  const withAddress = contacts.filter((c) => c.address !== null).length;
  const withPhone = contacts.filter((c) => c.phone !== null).length;
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="font-medium">{contacts.length} personne{contacts.length > 1 ? "s" : ""}</span> dans « {fileName} » :
        {" "}{withAddress} avec une adresse, {withPhone} avec un téléphone.
      </p>
      {deceased > 0 && <p className="text-muted-foreground">{deceased} personne{deceased > 1 ? "s décédées ne seront pas importées" : " décédée ne sera pas importée"}.</p>}
      <p className="text-muted-foreground">
        Les personnes déjà dans l&apos;agenda ne sont pas dupliquées : leur adresse et leur téléphone sont ajoutés
        s&apos;ils manquent. Si le fichier en indique d&apos;autres, vous choisissez ci-dessous ce qui est gardé.
        Fréquence par défaut des nouvelles : 1 visite par trimestre.
      </p>
    </div>
  );
}

function NameList({ title, names, hint }: { title: string; names: string[]; hint: string }) {
  if (names.length === 0) return null;
  return (
    <div className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2">
      <p className="font-medium text-amber-900">{title} ({names.length})</p>
      <p className="text-amber-900">{hint}</p>
      <ul className="list-disc pl-5">
        {names.map((name) => <li key={name}>{name}</li>)}
      </ul>
    </div>
  );
}

function Report({ report }: { report: ImportReport }) {
  const parts = [
    report.added > 0 && `${report.added} ajoutée${report.added > 1 ? "s" : ""}`,
    report.completed > 0 && `${report.completed} complétée${report.completed > 1 ? "s" : ""}`,
    report.replaced > 0 && `${report.replaced} mise${report.replaced > 1 ? "s" : ""} à jour depuis le fichier`,
    report.unchanged > 0 && `${report.unchanged} déjà à jour`,
  ].filter(Boolean);
  return (
    <div className="space-y-3 text-sm">
      <p role="status" className="font-medium">Import terminé : {parts.length > 0 ? parts.join(", ") : "aucun changement"}.</p>
      <NameList title="Adresse à renseigner" names={report.addressNotFound} hint="Adresse absente du fichier ou introuvable : complétez-la dans leur fiche." />
      <NameList title="Adresse à vérifier" names={report.imprecise} hint="Seule la rue ou la commune a été trouvée." />
      <NameList title="Ancienne adresse gardée" names={report.addressKept} hint="L'adresse du fichier est introuvable : celle de l'agenda n'a pas été remplacée." />
      <NameList title="Non importées" names={report.ambiguous} hint="Plusieurs personnes de l'agenda ou de vos dossiers portent ce nom : ajoutez-les à la main." />
    </div>
  );
}

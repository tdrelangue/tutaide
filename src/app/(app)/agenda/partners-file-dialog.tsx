"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookUser, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AgendaGroupView } from "@/lib/agenda/groups";
import type { AgendaPartnerView } from "@/lib/agenda/partners";
import {
  detectColumns,
  findDuplicate,
  findHeaderRow,
  guessGroup,
  readPartnerRows,
  readVcards,
  type PartnerField,
  type PartnersFileResult,
} from "@/lib/agenda/partners-file";
import type { PartnerImportReport } from "@/lib/agenda/partners-import";
import { partnerName } from "@/lib/agenda/rules";
import { ERROR_TEXT } from "./address-field";
import { importAgendaPartnersFromFile } from "./actions";
import { readAddressBookFile } from "./partners-file-read";
import { ColumnMapping, LinesTable, type DuplicateMode, type ReviewLine } from "./partners-file-review";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ".xls,.xlsx,.ods,.csv,.txt,.vcf";
const MISSING_COLUMNS =
  "Aucune colonne « Nom », « Nom et prénom » ou « Société » trouvée dans les 10 premières lignes. Vérifiez que le fichier a une ligne de titres.";

/** The file as read: spreadsheet rows (with the columns to read) or vCards. */
type Source =
  | { kind: "rows"; rows: unknown[][]; headerIndex: number; mapping: (PartnerField | null)[] }
  | { kind: "vcard"; result: PartnersFileResult };

type Step =
  | { kind: "choose"; error: string | null }
  | { kind: "reading" }
  | { kind: "ready"; fileName: string; source: Source }
  | { kind: "importing"; count: number }
  | { kind: "done"; report: PartnerImportReport };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: AgendaGroupView[];
  /** The book, to spot the contacts already in it. */
  partners: readonly AgendaPartnerView[];
};

function resultOf(source: Source): PartnersFileResult {
  return source.kind === "vcard" ? source.result : readPartnerRows(source.rows, source.headerIndex, source.mapping);
}

/** The group of « Autres partenaires » when there is one: where a contact with no clue goes. */
function defaultGroup(groups: readonly AgendaGroupView[]): string | null {
  return (groups.find((g) => /autre/i.test(g.name)) ?? groups[0])?.id ?? null;
}

/** Lines with their guessed group and duplicate, then the user's choices on top. */
function reviewLines(result: PartnersFileResult, props: Props, groupChoice: ReadonlyMap<number, string>, modeChoice: ReadonlyMap<number, DuplicateMode>): ReviewLine[] {
  const fallback = defaultGroup(props.groups);
  return result.lines.map((line, i) => {
    const duplicate = findDuplicate(line, props.partners);
    return {
      line,
      groupId: groupChoice.get(i) ?? guessGroup(line, props.groups)?.id ?? fallback,
      duplicateOf: duplicate ? partnerName(duplicate) : null,
      mode: modeChoice.get(i) ?? "keep",
    };
  });
}

/**
 * « Importer des contacts » (Thomas, 2026-11-02): same system and layout as the
 * persons' import. The file is read in the browser; the page shows what was
 * understood (columns, groups, duplicates), the user corrects, then imports.
 */
export function PartnersFileDialog(props: Props) {
  const { open, onOpenChange, groups, partners } = props;
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "choose", error: null });
  const [groupChoice, setGroupChoice] = useState<ReadonlyMap<number, string>>(new Map());
  const [modeChoice, setModeChoice] = useState<ReadonlyMap<number, DuplicateMode>>(new Map());
  const isBusy = step.kind === "reading" || step.kind === "importing";
  const result = step.kind === "ready" ? resultOf(step.source) : null;
  const lines = result ? reviewLines(result, { open, onOpenChange, groups, partners }, groupChoice, modeChoice) : [];

  async function readFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setStep({ kind: "choose", error: "Ce fichier est trop volumineux pour être un carnet d'adresses." });
      return;
    }
    setStep({ kind: "reading" });
    try {
      const read = await readAddressBookFile(file);
      const source = sourceOf(read);
      if (typeof source === "string") {
        setStep({ kind: "choose", error: source });
        return;
      }
      setGroupChoice(new Map());
      setModeChoice(new Map());
      setStep({ kind: "ready", fileName: file.name, source });
    } catch {
      setStep({ kind: "choose", error: "Ce fichier n'a pas pu être lu. Utilisez un fichier Excel (.xls, .xlsx), OpenDocument (.ods), CSV ou vCard (.vcf)." });
    }
  }

  function setMapping(mapping: (PartnerField | null)[]) {
    if (step.kind !== "ready" || step.source.kind !== "rows") return;
    // Other columns, other lines: the choices made line by line no longer apply.
    setGroupChoice(new Map());
    setModeChoice(new Map());
    setStep({ ...step, source: { ...step.source, mapping } });
  }

  async function handleImport() {
    if (step.kind !== "ready") return;
    const payload = lines
      .filter((r) => r.mode !== "skip")
      .map((r) => {
        const existing = r.duplicateOf ? findDuplicate(r.line, partners) : null;
        return { ...r.line, groupId: r.groupId, existingId: existing?.id ?? null, mode: r.mode === "replace" ? "replace" : "keep" };
      });
    if (payload.length === 0) {
      toast.error("Aucun contact à importer.");
      return;
    }
    const previous = step;
    setStep({ kind: "importing", count: payload.length });
    try {
      const outcome = await importAgendaPartnersFromFile(payload);
      if (!outcome.success) {
        setStep(previous);
        toast.error(outcome.error);
        return;
      }
      setStep({ kind: "done", report: outcome.report });
      router.refresh();
    } catch {
      setStep(previous);
      toast.error("Erreur inattendue. Réessayez ; si cela persiste, contactez le support OrigAI.");
    }
  }

  function handleOpenChange(next: boolean) {
    if (isBusy) return;
    if (!next) setStep({ kind: "choose", error: null });
    onOpenChange(next);
  }

  const toImport = lines.filter((r) => r.mode !== "skip").length;
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importer des contacts</DialogTitle>
          <DialogDescription>
            Un tableau (Excel, CSV) ou le carnet d&apos;adresses de votre messagerie (vCard). Le fichier est lu sur votre
            ordinateur ; vous vérifiez ce qui a été compris avant d&apos;importer.
          </DialogDescription>
        </DialogHeader>

        <div aria-live="polite" className="space-y-3">
          {(step.kind === "choose" || step.kind === "reading") && (
            <DropZone isReading={step.kind === "reading"} error={step.kind === "choose" ? step.error : null} onFile={readFile} />
          )}
          {step.kind === "ready" && result && (
            <>
              <Summary fileName={step.fileName} result={result} lines={lines} />
              {step.source.kind === "rows" && (
                <ColumnMapping header={step.source.rows[step.source.headerIndex] ?? []} mapping={step.source.mapping} onChange={setMapping} />
              )}
              {lines.length > 0 && (
                <LinesTable
                  lines={lines}
                  groups={groups}
                  onGroup={(i, groupId) => setGroupChoice((m) => new Map(m).set(i, groupId))}
                  onMode={(i, mode) => setModeChoice((m) => new Map(m).set(i, mode))}
                />
              )}
            </>
          )}
          {step.kind === "importing" && (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Import de {step.count} contacts et recherche de leurs adresses… cela peut prendre une minute.
            </p>
          )}
          {step.kind === "done" && <Report report={step.report} />}
        </div>

        <DialogFooter>
          {step.kind === "ready" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep({ kind: "choose", error: null })}>Choisir un autre fichier</Button>
              <Button type="button" onClick={handleImport} disabled={toImport === 0}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Importer {toImport} contact{toImport > 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step.kind === "done" && <Button type="button" onClick={() => handleOpenChange(false)}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What was read, or the error to show. */
function sourceOf(read: Awaited<ReturnType<typeof readAddressBookFile>>): Source | string {
  if (read.kind === "vcard") {
    const result = readVcards(read.text);
    return result.lines.length === 0 ? "Aucun contact trouvé dans ce fichier vCard." : { kind: "vcard", result };
  }
  const headerIndex = findHeaderRow(read.rows);
  if (headerIndex < 0) return MISSING_COLUMNS;
  return { kind: "rows", rows: read.rows, headerIndex, mapping: detectColumns(read.rows[headerIndex] ?? []) };
}

function Summary({ fileName, result, lines }: { fileName: string; result: PartnersFileResult; lines: readonly ReviewLine[] }) {
  const duplicates = lines.filter((r) => r.duplicateOf !== null).length;
  const withAddress = lines.filter((r) => r.line.addressQuery !== null).length;
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="font-medium">{lines.length} contact{lines.length > 1 ? "s" : ""}</span> dans « {fileName} » : {withAddress} avec une adresse.
        {duplicates > 0 && ` ${duplicates} déjà dans le carnet : choisissez pour chacun ci-dessous.`}
      </p>
      {result.skipped > 0 && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-amber-900">
          {result.skipped} ligne{result.skipped > 1 ? "s" : ""} sans nom ni structure ne {result.skipped > 1 ? "seront" : "sera"} pas importée{result.skipped > 1 ? "s" : ""}.
          Si c&apos;est une erreur, corrigez les colonnes.
        </p>
      )}
      <p className="text-muted-foreground">Le groupe est deviné d&apos;après le métier ou la catégorie ; changez-le ligne par ligne si besoin.</p>
    </div>
  );
}

function DropZone({ isReading, error, onFile }: { isReading: boolean; error: string | null; onFile: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  }
  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !isReading) onFile(file);
  }
  return (
    <div className="space-y-2">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm transition-colors",
          "focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50",
          isDragging && "border-primary bg-primary/5",
        )}
      >
        {isReading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" /> : <BookUser className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        <span className="font-medium">{isReading ? "Lecture du fichier…" : "Déposez le fichier ici"}</span>
        {!isReading && <span className="text-muted-foreground">ou cliquez pour le choisir (.xls, .xlsx, .ods, .csv, .vcf)</span>}
        <input type="file" accept={ACCEPTED} onChange={handleChange} disabled={isReading} className="sr-only" />
      </label>
      {error && <p role="alert" className={ERROR_TEXT}>{error}</p>}
    </div>
  );
}

function NameList({ title, names, hint }: { title: string; names: string[]; hint: string }) {
  if (names.length === 0) return null;
  return (
    <div className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2">
      <p className="font-medium text-amber-900">{title} ({names.length})</p>
      <p className="text-amber-900">{hint}</p>
      <ul className="list-disc pl-5">{names.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}</ul>
    </div>
  );
}

function Report({ report }: { report: PartnerImportReport }) {
  const parts = [
    report.added > 0 && `${report.added} ajouté${report.added > 1 ? "s" : ""}`,
    report.completed > 0 && `${report.completed} complété${report.completed > 1 ? "s" : ""}`,
    report.replaced > 0 && `${report.replaced} remplacé${report.replaced > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return (
    <div className="space-y-3 text-sm">
      <p role="status" className="font-medium">Import terminé : {parts.length > 0 ? parts.join(", ") : "aucun changement"}.</p>
      <NameList title="Adresse à renseigner" names={report.addressNotFound} hint="Adresse absente du fichier ou introuvable : complétez-la dans leur fiche." />
      <NameList title="Adresse à vérifier" names={report.imprecise} hint="Seule la rue ou la commune a été trouvée." />
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { FileStack, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SORTABLE_ACCEPT, useSortingLauncher } from "./use-sorting-launcher";
import { useAshImport } from "./use-ash-import";
import { AshImportResults } from "./ash-import-results";
import type { SortModule } from "./use-sorting-session";

const COPY: Record<"auto" | "manual", { hint: string; detail: string }> = {
  auto: {
    hint: "Glissez-déposez vos PDF ASH n'importe où sur la liste des dossiers",
    detail: "Chacun est rangé automatiquement. Ceux qui ne sont pas reconnus, vous les rangez à la main.",
  },
  manual: {
    hint: "Glissez-déposez vos documents n'importe où sur la liste des dossiers",
    detail: "PDF ou images. Vous choisissez le dossier de chacun, avec un aperçu du document.",
  },
};

/** Fictional documents offered during a demo (public/demo/exemples). */
const DEMO_SAMPLES: Record<SortModule, string[]> = {
  ASH: ["ASH_Versaire_T3_2026.pdf", "ASH_Ochon_T3_2026.pdf", "ASH_Cover_T3_2026.pdf", "Courrier_departement.pdf"],
  APA: ["Facture_aide_a_domicile_Aude_Javel.pdf", "Releve_bancaire_Marc_Assin.pdf"],
  PCH: ["Devis_amenagement_Sophie_Stique.pdf"],
};

async function loadDemoSamples(moduleType: SortModule): Promise<File[]> {
  return Promise.all(
    DEMO_SAMPLES[moduleType].map(async (name) => {
      const response = await fetch(`/demo/exemples/${name}`);
      return new File([await response.blob()], name, { type: "application/pdf" });
    })
  );
}

/** True when the drag carries files (not text or a link). */
function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/**
 * The dossier list of a module, as one big drop target, with the same banner
 * on every module. ASH files are imported automatically (unrecognised ones go
 * to manual sorting); APA and PCH files go straight to manual sorting.
 */
export function ModuleDropArea({
  moduleType,
  isDemo = false,
  children,
}: {
  moduleType: SortModule;
  /** Demo account: also offer fictional documents to try the drop with. */
  isDemo?: boolean;
  children: React.ReactNode;
}) {
  const isAsh = moduleType === "ASH";
  const ash = useAshImport();
  const manual = useSortingLauncher(moduleType);
  const start = isAsh ? ash.start : manual.start;
  const drag = useFileDrag(start);
  const copy = COPY[isAsh ? "auto" : "manual"];

  // Dialogs sit outside the drop target: React events bubble through portals,
  // so a file dropped onto an open dialog would otherwise start a new batch.
  return (
    <>
      {/* At least down to the bottom of the window, so the empty space under a
          short list is droppable too (header, tabs, title and filters ≈ 15rem). */}
      <div className="relative flex min-h-[calc(100vh-15rem)] flex-1 flex-col" {...drag.handlers}>
        <div className="border-b px-6 py-3">
          <DropBanner
            hint={copy.hint}
            detail={copy.detail}
            isBusy={ash.isProcessing}
            onFiles={start}
            onDemoSamples={isDemo ? () => loadDemoSamples(moduleType).then(start) : undefined}
          />
          {isAsh && ash.results && (
            <div className="pt-3">
              <AshImportResults results={ash.results} unsortedCount={ash.unsorted.length} onSortByHand={ash.openSorting} />
            </div>
          )}
        </div>
        {children}
        {drag.isOver && <DropOverlay text={isAsh ? "Déposez vos PDF ASH : rangement automatique" : "Déposez vos documents pour les ranger"} />}
      </div>
      {isAsh ? ash.dialog : manual.dialog}
    </>
  );
}

function useFileDrag(onFiles: (files: File[]) => void) {
  const depth = useRef(0);
  const [isOver, setIsOver] = useState(false);

  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current += 1;
      setIsOver(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setIsOver(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };
  return { isOver, handlers };
}

function DropBanner(props: {
  hint: string;
  detail: string;
  isBusy: boolean;
  onFiles: (files: File[]) => void;
  onDemoSamples?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    props.onFiles(files);
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-3 text-center sm:flex-row sm:text-left" data-tour="dossier-drop">
      {props.isBusy ? (
        <Loader2 className="h-6 w-6 shrink-0 animate-spin text-primary" aria-hidden="true" />
      ) : (
        <Upload className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="flex-1">
        <p className="text-sm font-medium">{props.isBusy ? "Rangement en cours…" : props.hint}</p>
        <p className="text-xs text-muted-foreground">{props.detail}</p>
      </div>
      <input ref={inputRef} type="file" accept={SORTABLE_ACCEPT} multiple className="hidden" onChange={handleFiles} aria-hidden="true" tabIndex={-1} />
      {props.onDemoSamples && (
        <Button size="sm" disabled={props.isBusy} onClick={props.onDemoSamples} data-tour="demo-samples">
          <FileStack className="mr-2 h-4 w-4" aria-hidden="true" />
          Essayer avec des documents d&apos;exemple
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={props.isBusy} onClick={() => inputRef.current?.click()}>
        Choisir des fichiers
      </Button>
    </div>
  );
}

function DropOverlay({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]" aria-hidden="true">
      <p className="flex items-center gap-2 rounded-lg bg-background px-4 py-3 text-base font-medium shadow">
        <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
        {text}
      </p>
    </div>
  );
}

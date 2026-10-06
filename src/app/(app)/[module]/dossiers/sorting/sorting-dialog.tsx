"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfRenderer } from "@/components/pdf-preview";
import { DossierPicker } from "./dossier-picker";
import { SortingHistory } from "./sorting-history";
import { useSortingSession, type SortModule } from "./use-sorting-session";

interface SortingDialogProps {
  open: boolean;
  files: File[];
  moduleType: SortModule;
  /** Receives the files still not filed (pending or skipped). */
  onClose: (remaining: File[]) => void;
}

/**
 * Manual sorting: the file on the left, the dossiers on the right. Choosing a
 * dossier asks for confirmation, then the next file comes up. Every filing
 * can be undone from the "Déjà rangés" list until the screen is closed.
 */
export function SortingDialog({ open, files, moduleType, onClose }: SortingDialogProps) {
  const session = useSortingSession(files, moduleType);
  const [closeWarning, setCloseWarning] = useState(false);
  const unsorted = session.counts.pending + session.counts.skipped;

  function close() {
    onClose(session.items.filter((item) => item.state !== "placed").map((item) => item.file));
  }

  function requestClose() {
    if (unsorted > 0 && !closeWarning) {
      setCloseWarning(true);
      return;
    }
    close();
  }

  function handleEscape(event: KeyboardEvent) {
    if (!session.pending) return;
    event.preventDefault();
    session.cancelChoice();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="flex h-[90vh] w-full max-w-6xl flex-col gap-4" onEscapeKeyDown={handleEscape}>
        <DialogHeader>
          <DialogTitle>Ranger les documents</DialogTitle>
          <DialogDescription>
            {session.counts.placed} rangé{session.counts.placed > 1 ? "s" : ""} sur {session.items.length}
            {session.counts.skipped > 0 && ` · ${session.counts.skipped} passé${session.counts.skipped > 1 ? "s" : ""}`}
          </DialogDescription>
        </DialogHeader>
        {closeWarning && unsorted > 0 && (
          <CloseWarning count={unsorted} onConfirm={close} onCancel={() => setCloseWarning(false)} />
        )}
        {session.error && (
          <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {session.error}
          </p>
        )}
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
          <FilePreview file={session.current?.file} />
          <aside className="flex min-h-0 flex-col gap-3">
            <SortingPanel session={session} moduleType={moduleType} onClose={close} />
            <SortingHistory items={session.items} isBusy={session.isBusy} onUndo={session.undo} />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortingPanel(props: {
  session: ReturnType<typeof useSortingSession>;
  moduleType: SortModule;
  onClose: () => void;
}) {
  const { session, onClose } = props;
  if (!session.current) {
    return <FinishedPanel skipped={session.counts.skipped} onReview={session.reviewSkipped} onClose={onClose} />;
  }
  return (
    <>
      <DossierPicker
        dossiers={session.dossiers}
        moduleType={props.moduleType}
        onCreated={session.addCreated}
        filename={session.current.file.name}
        pending={session.pending}
        isBusy={session.isBusy}
        onChoose={session.choose}
        onConfirm={session.confirm}
        onCancel={session.cancelChoice}
      />
      {!session.pending && (
        <Button variant="outline" disabled={session.isBusy} onClick={session.skip}>
          <SkipForward className="mr-2 h-4 w-4" aria-hidden="true" />
          Passer ce fichier pour l&apos;instant
        </Button>
      )}
    </>
  );
}

/** A temporary URL for the file, created and released by the same effect. */
function useObjectUrl(file?: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

function FilePreview({ file }: { file?: File }) {
  const url = useObjectUrl(file);

  if (!file || !url) {
    return <div className="rounded-lg border bg-muted/30" aria-hidden="true" />;
  }
  return (
    <section className="flex min-h-0 flex-col gap-2 rounded-lg border p-3" aria-label={`Aperçu de ${file.name}`}>
      <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
      {file.type === "application/pdf" ? (
        <PdfRenderer key={url} url={url} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Aperçu de ${file.name}`} className="mx-auto max-h-full max-w-full rounded object-contain" />
      )}
    </section>
  );
}

function FinishedPanel(props: { skipped: number; onReview: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border p-4">
      <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden="true" />
      {props.skipped > 0 ? (
        <>
          <p className="text-sm">
            {props.skipped} fichier{props.skipped > 1 ? "s ont été passés" : " a été passé"}.
          </p>
          <Button onClick={props.onReview}>Les revoir maintenant</Button>
          <Button variant="outline" onClick={props.onClose}>Fermer sans les ranger</Button>
        </>
      ) : (
        <>
          <p className="text-sm">Tous les fichiers sont rangés. Vous pouvez encore annuler un rangement ci-dessous.</p>
          <Button onClick={props.onClose}>Terminer</Button>
        </>
      )}
    </div>
  );
}

function CloseWarning(props: { count: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
      <span className="flex-1">
        {props.count} fichier{props.count > 1 ? "s ne sont pas rangés" : " n'est pas rangé"}. Ils restent sur votre
        ordinateur, mais il faudra les déposer à nouveau.
      </span>
      <Button size="sm" onClick={props.onCancel}>Continuer le tri</Button>
      <Button size="sm" variant="outline" onClick={props.onConfirm}>Fermer quand même</Button>
    </div>
  );
}

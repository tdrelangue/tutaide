"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  changeDocumentsLocation,
  getDocumentsLocation,
  type DocumentsLocation,
} from "./documents-location-actions";

type Message = { type: "success" | "error"; text: string };
/** A folder waiting for confirmation; null = back to the default folder. */
type Pending = { dir: string | null; label: string };

/** Native folder picker of the desktop app; null in a plain browser or if cancelled. */
async function pickFolder(): Promise<string | null> {
  const { isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, title: "Emplacement des documents" });
  return typeof picked === "string" ? picked : null;
}

function successText(copied: number | null): string {
  if (copied === null) return "Emplacement des documents mis à jour.";
  return `Emplacement mis à jour : ${copied} document(s) copié(s). L'ancien dossier n'a pas été vidé.`;
}

function useDocumentsLocation() {
  const [location, setLocation] = useState<DocumentsLocation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const reload = useCallback(() => {
    getDocumentsLocation().then(setLocation).catch(() => setLocation(null));
  }, []);
  useEffect(reload, [reload]);

  async function apply(dir: string | null, copy: boolean): Promise<boolean> {
    setIsSaving(true);
    setMessage(null);
    const result = await changeDocumentsLocation(dir, copy);
    setIsSaving(false);
    if (!result.success) {
      setMessage({ type: "error", text: result.error });
      return false;
    }
    setMessage({ type: "success", text: successText(result.report?.copied ?? null) });
    reload();
    return true;
  }

  return { location, isSaving, message, apply };
}

type ConfirmPanelProps = {
  pending: Pending;
  isSaving: boolean;
  onConfirm: (copy: boolean) => void;
  onCancel: () => void;
};

function ConfirmPanel({ pending, isSaving, onConfirm, onCancel }: ConfirmPanelProps) {
  return (
    <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4" role="group" aria-label="Confirmer le nouvel emplacement">
      <p className="text-sm">
        Nouvel emplacement : <span className="font-medium break-all">{pending.label}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Les documents de l&apos;emplacement actuel peuvent y être copiés. L&apos;ancien dossier
        n&apos;est jamais vidé : vous pourrez y revenir à tout moment.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onConfirm(true)} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Copier mes documents et utiliser ce dossier
        </Button>
        <Button type="button" variant="outline" onClick={() => onConfirm(false)} disabled={isSaving}>
          Utiliser ce dossier sans copier
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function StatusMessage({ message }: { message: Message }) {
  const isSuccess = message.type === "success";
  return (
    <div role="status" className={`flex items-center gap-2 text-sm ${isSuccess ? "text-green-600" : "text-destructive"}`}>
      {isSuccess ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      {message.text}
    </div>
  );
}

function SyncExplanation() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li>
        Choisissez un dossier synchronisé (OneDrive, SharePoint, Dropbox, lecteur réseau…) pour
        retrouver vos documents sur plusieurs ordinateurs.
      </li>
      <li>Sur chaque ordinateur, choisissez le même dossier synchronisé.</li>
      <li>Un document apparaît sur un autre ordinateur une fois la synchronisation terminée.</li>
      <li>Un document retiré (à la main, ou automatiquement après l&apos;envoi d&apos;un dossier) disparaît sur tous les ordinateurs.</li>
    </ul>
  );
}

export function DocumentsLocationCard() {
  const { location, isSaving, message, apply } = useDocumentsLocation();
  const [pending, setPending] = useState<Pending | null>(null);
  const [typedPath, setTypedPath] = useState("");

  async function handleChoose() {
    const picked = await pickFolder();
    if (picked) setPending({ dir: picked, label: picked });
  }

  function handleUseTypedPath() {
    const dir = typedPath.trim();
    if (dir) setPending({ dir, label: dir });
  }

  async function handleConfirm(copy: boolean) {
    if (!pending) return;
    if (await apply(pending.dir, copy)) {
      setPending(null);
      setTypedPath("");
    }
  }

  if (!location) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emplacement des documents</CardTitle>
        <CardDescription>
          Dossier où Tutellia range les documents de vos dossiers. Réglage propre à cet ordinateur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          Emplacement actuel : <span className="font-medium break-all">{location.current}</span>
          {location.isDefault && <span className="text-muted-foreground"> (par défaut)</span>}
        </p>
        <SyncExplanation />
        {location.isLocked ? (
          <p className="text-sm text-muted-foreground">Non modifiable pendant le test de l&apos;application.</p>
        ) : pending ? (
          <ConfirmPanel pending={pending} isSaving={isSaving} onConfirm={handleConfirm} onCancel={() => setPending(null)} />
        ) : (
          <LocationChooser
            isDefault={location.isDefault}
            defaultDir={location.defaultDir}
            typedPath={typedPath}
            onTypedPathChange={setTypedPath}
            onChoose={handleChoose}
            onUseTypedPath={handleUseTypedPath}
            onBackToDefault={() => setPending({ dir: null, label: `${location.defaultDir} (par défaut)` })}
          />
        )}
        {message && <StatusMessage message={message} />}
      </CardContent>
    </Card>
  );
}

type LocationChooserProps = {
  isDefault: boolean;
  defaultDir: string;
  typedPath: string;
  onTypedPathChange: (value: string) => void;
  onChoose: () => void;
  onUseTypedPath: () => void;
  onBackToDefault: () => void;
};

function LocationChooser(props: LocationChooserProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={props.onChoose}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Choisir un dossier…
        </Button>
        {!props.isDefault && (
          <Button type="button" variant="outline" onClick={props.onBackToDefault}>
            Revenir au dossier par défaut
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="documentsPath">Ou collez le chemin du dossier</Label>
        <div className="flex gap-2">
          <Input
            id="documentsPath"
            value={props.typedPath}
            onChange={(e) => props.onTypedPathChange(e.target.value)}
            placeholder="C:\Users\vous\OneDrive\Tutellia"
          />
          <Button type="button" variant="outline" onClick={props.onUseTypedPath} disabled={!props.typedPath.trim()}>
            Utiliser
          </Button>
        </div>
      </div>
    </div>
  );
}

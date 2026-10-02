"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  saveUpdaterEndpoint,
  testUpdaterEndpoint,
  type UpdaterSettingsData,
} from "../actions";

type TestState = { ok: boolean; message: string } | null;

/** Admin setting: where desktop installs look for updates (latest.json). */
export function UpdateEndpointForm({ settings }: { settings: UpdaterSettingsData }) {
  const router = useRouter();
  const [url, setUrl] = useState(settings.savedEndpoint ?? "");
  const [busy, setBusy] = useState<"test" | "save" | "reset" | null>(null);
  const [testState, setTestState] = useState<TestState>(null);

  function handleUrlChange(event: React.ChangeEvent<HTMLInputElement>) {
    setUrl(event.target.value);
    setTestState(null);
  }

  async function handleTest() {
    setBusy("test");
    const result = await testUpdaterEndpoint(url);
    setTestState(
      result.ok
        ? { ok: true, message: `Manifeste trouvé : version ${result.version}${result.downloadUrl ? `, installeur ${result.downloadUrl}` : ""}.` }
        : { ok: false, message: result.error }
    );
    setBusy(null);
  }

  async function handleSave() {
    setBusy("save");
    const result = await saveUpdaterEndpoint(url);
    setBusy(null);
    if (!result.success) {
      setTestState({ ok: false, message: result.error ?? "Erreur" });
      return;
    }
    toast.success("Adresse de mise à jour enregistrée");
    router.refresh();
  }

  async function handleReset() {
    setBusy("reset");
    const result = await saveUpdaterEndpoint(null);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error ?? "Erreur");
      return;
    }
    setUrl("");
    setTestState(null);
    toast.success("Adresses par défaut rétablies");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mises à jour du logiciel</CardTitle>
        <CardDescription>
          Adresse du fichier <code>latest.json</code> que les installations Tutellia consultent pour
          trouver une nouvelle version. À ne changer qu&apos;en cas de déménagement du site de
          téléchargement. Les mises à jour restent vérifiées par la signature intégrée au logiciel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="update-endpoint">Adresse personnalisée (facultative)</Label>
          <Input
            id="update-endpoint"
            type="url"
            inputMode="url"
            placeholder={settings.defaultEndpoints[0]}
            value={url}
            onChange={handleUrlChange}
            disabled={busy !== null}
            aria-describedby="update-endpoint-hint update-endpoint-result"
          />
          <p id="update-endpoint-hint" className="text-sm text-muted-foreground">
            {settings.savedEndpoint
              ? "Cette adresse est essayée en premier, puis les adresses par défaut ci-dessous."
              : "Aucune adresse personnalisée : les installations utilisent les adresses par défaut ci-dessous."}
          </p>
        </div>

        <div id="update-endpoint-result" aria-live="polite">
          {testState && (
            <p role={testState.ok ? "status" : "alert"} className={testState.ok ? "text-sm" : "text-sm text-destructive"}>
              {testState.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleTest} disabled={busy !== null || !url.trim()}>
            {busy === "test" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Tester
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy !== null || !url.trim()}>
            {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Enregistrer
          </Button>
          {settings.savedEndpoint && (
            <Button type="button" variant="ghost" onClick={handleReset} disabled={busy !== null}>
              {busy === "reset" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Revenir aux adresses par défaut
            </Button>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Adresses par défaut, dans l&apos;ordre</p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {settings.defaultEndpoints.map((endpoint) => (
              <li key={endpoint} className="break-all">{endpoint}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

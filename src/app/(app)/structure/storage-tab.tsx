"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStructureFolderHint } from "./actions";
import { useStructureAction } from "./use-structure-action";

/**
 * The team shares documents through one synced folder (SharePoint, OneDrive,
 * network drive). The admin names it here; each member sees it in Settings
 * and picks it on their computer.
 */
export function StorageTab({ hint }: { hint: string | null }) {
  const { run, isBusy } = useStructureAction();
  const [value, setValue] = useState(hint ?? "");

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Dossier partagé des documents</CardTitle>
        <CardDescription>
          Pour que tout le monde voie les mêmes documents, chaque membre doit choisir, sur son
          ordinateur, le même dossier synchronisé (SharePoint, OneDrive, lecteur réseau…) dans
          Paramètres → Général → Emplacement des documents. Indiquez ici lequel : il sera affiché
          à chaque membre.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => saveStructureFolderHint(value));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="shared-folder">Dossier à choisir par chaque membre</Label>
            <Input
              id="shared-folder"
              value={value}
              maxLength={300}
              placeholder="Ex. : SharePoint UDAF › Tutellia › Documents"
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isBusy}>Enregistrer</Button>
        </form>
      </CardContent>
    </Card>
  );
}

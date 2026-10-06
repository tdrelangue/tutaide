"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  setMandataireSelection,
  type MandataireContext,
} from "@/lib/access/selection-actions";

const ALL = "all";

/**
 * Assistants: choose whose dossiers the screens show — all their MJPMs, or
 * one. Remembered across sessions; every list and "Envoyer tout" follow it.
 */
export function MandataireSelect({ context }: { context: MandataireContext }) {
  const router = useRouter();
  const [value, setValue] = useState(context.selection);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    setValue(next);
    startTransition(async () => {
      const saved = await setMandataireSelection(next);
      setValue(saved.selection);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="mandataire-select" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="h-4 w-4" aria-hidden="true" />
        Mandataire
      </Label>
      <Select value={value} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger id="mandataire-select" className="h-8 w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous mes mandataires</SelectItem>
          {context.choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Mise à jour" />}
    </div>
  );
}

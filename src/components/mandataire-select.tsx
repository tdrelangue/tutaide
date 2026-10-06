"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  const [announcement, setAnnouncement] = useState("");
  const current = context.choices.find((c) => c.id === value);

  function handleChange(next: string) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      try {
        const saved = await setMandataireSelection(next);
        setValue(saved.selection);
        const name = context.choices.find((c) => c.id === saved.selection)?.name;
        setAnnouncement(name ? `Affichage : dossiers de ${name}` : "Affichage : tous mes mandataires");
        router.refresh();
      } catch {
        setValue(previous);
        toast.error("Le choix du mandataire n'a pas pu être enregistré. Réessayez.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {current && (
        // Mode indicator: an assistant must always see whose dossiers are shown.
        <span className="rounded-md bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground">
          Vous travaillez pour : {current.name}
        </span>
      )}
      <span role="status" className="sr-only">{isPending ? "Mise à jour…" : announcement}</span>
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
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
    </div>
  );
}

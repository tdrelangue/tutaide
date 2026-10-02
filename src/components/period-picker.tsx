"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MOIS_LABELS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

export type TrimestreValue = "1" | "2" | "3" | "4";
export type MoisValue =
  | "1" | "2" | "3" | "4" | "5" | "6"
  | "7" | "8" | "9" | "10" | "11" | "12";

export function computeDefaultPeriode(): {
  trimestre: TrimestreValue;
  mois: MoisValue;
  annee: string;
} {
  const now = new Date();
  // getMonth()/3 and +1 always land in 1-4 and 1-12 respectively.
  const trimestre = Math.ceil((now.getMonth() + 1) / 3).toString() as TrimestreValue;
  const mois = (now.getMonth() + 1).toString() as MoisValue;
  const annee = now.getFullYear().toString();
  return { trimestre, mois, annee };
}

/** Human-readable period label for confirmation dialogs, e.g. "3eme trimestre 2026", "Septembre 2026", or "3eme trimestre / Septembre 2026" when both apply. */
export function formatPeriodeLabel(
  showTrimestre: boolean,
  showMois: boolean,
  trimestre: string | undefined,
  mois: string | undefined,
  annee: string | undefined
): string {
  const parts: string[] = [];
  if (showTrimestre && trimestre) {
    parts.push(`${trimestre}${trimestre === "1" ? "er" : "eme"} trimestre`);
  }
  if (showMois && mois) {
    parts.push(MOIS_LABELS[parseInt(mois, 10) - 1] ?? mois);
  }
  return `${parts.join(" / ")} ${annee ?? ""}`.trim();
}

interface PeriodePickerProps {
  showTrimestre: boolean;
  showMois: boolean;
  trimestre: TrimestreValue | undefined;
  mois: MoisValue | undefined;
  annee: string | undefined;
  onTrimestreChange: (value: TrimestreValue) => void;
  onMoisChange: (value: MoisValue) => void;
  onAnneeChange: (value: string) => void;
  disabled?: boolean;
  helperText?: string;
}

export function PeriodePicker({
  showTrimestre,
  showMois,
  trimestre,
  mois,
  annee,
  onTrimestreChange,
  onMoisChange,
  onAnneeChange,
  disabled,
  helperText,
}: PeriodePickerProps) {
  if (!showTrimestre && !showMois) return null;

  return (
    <div className="space-y-2">
      <Label>Période du rapport</Label>
      <div className="flex flex-wrap gap-2">
        {showTrimestre && (
          <Select
            value={trimestre}
            // Values are hardcoded to "1"-"4" by the SelectItems below.
            onValueChange={(value) => onTrimestreChange(value as TrimestreValue)}
          >
            <SelectTrigger aria-label="Trimestre" className="w-40">
              <SelectValue placeholder="Trimestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1er trimestre</SelectItem>
              <SelectItem value="2">2eme trimestre</SelectItem>
              <SelectItem value="3">3eme trimestre</SelectItem>
              <SelectItem value="4">4eme trimestre</SelectItem>
            </SelectContent>
          </Select>
        )}
        {showMois && (
          <Select
            value={mois}
            // Values are hardcoded to "1"-"12" by the SelectItems below.
            onValueChange={(value) => onMoisChange(value as MoisValue)}
          >
            <SelectTrigger aria-label="Mois" className="w-36">
              <SelectValue placeholder="Mois" />
            </SelectTrigger>
            <SelectContent>
              {MOIS_LABELS.map((label, i) => (
                <SelectItem key={label} value={String(i + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          type="number"
          aria-label="Année"
          disabled={disabled}
          value={annee ?? ""}
          onChange={(e) => onAnneeChange(e.target.value)}
          className="w-28"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {helperText ??
          "Utilisée pour les modèles faisant référence à la période. Vérifiez avant d'envoyer un rapport en retard."}
      </p>
    </div>
  );
}

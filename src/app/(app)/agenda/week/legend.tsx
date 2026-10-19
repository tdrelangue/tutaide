import type { WeekView } from "@/lib/agenda/views/types";
import { hm } from "./format";

/** Swatches use the same shapes as the cards, and every swatch has its word. */
const KEYS: readonly { readonly label: string; readonly swatch: string }[] = [
  { label: "Validé", swatch: "border border-agenda-held/40 border-l-4 border-l-agenda-held bg-agenda-held-soft" },
  { label: "Proposé (pointillés)", swatch: "border-2 border-dashed border-agenda-proposed/60 bg-background" },
  { label: "Placé à la main", swatch: "border-2 border-agenda-proposed bg-background" },
  { label: "Heure fixe", swatch: "border border-agenda-fixed/40 border-l-4 border-l-agenda-fixed bg-agenda-fixed-soft" },
  { label: "Vu / N'a pas eu lieu", swatch: "border border-border bg-muted" },
  { label: "Indisponible, pause (hachuré)", swatch: "agenda-hatch border border-agenda-busy bg-agenda-paper" },
];

export function Legend({ grid }: { grid: WeekView["grid"] }) {
  const hasLimit = grid.dayEndLimit !== null && grid.dayEndLimit > grid.dayEnd;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <ul aria-label="Légende" className="flex flex-wrap gap-x-4 gap-y-1">
        {KEYS.map((key) => (
          <li key={key.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-3.5 w-4 rounded-sm ${key.swatch}`} />
            {key.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dotted border-agenda-warn" />
          Fin de journée souhaitée ({hm(grid.dayEnd)})
        </li>
        {hasLimit && grid.dayEndLimit !== null && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block w-5 border-t-2 border-destructive" />
            Limite stricte ({hm(grid.dayEndLimit)})
          </li>
        )}
      </ul>
      <p>
        Avant validation, glissez un bloc proposé vers un autre moment (ou « Déplacer… » dans son menu) : il reste où
        vous le posez et le reste se replanifie autour. Échap annule un glisser.
      </p>
    </div>
  );
}

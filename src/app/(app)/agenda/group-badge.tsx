"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP_COLORS, GROUP_COLOR_LABELS, type GroupColor, type GroupTag } from "@/lib/agenda/groups-rules";

/** Literal class names (Tailwind only keeps the classes it can read in the source). */
const SWATCH: Readonly<Record<GroupColor, string>> = {
  blue: "bg-group-blue",
  teal: "bg-group-teal",
  green: "bg-group-green",
  lime: "bg-group-lime",
  amber: "bg-group-amber",
  orange: "bg-group-orange",
  red: "bg-group-red",
  pink: "bg-group-pink",
  purple: "bg-group-purple",
  slate: "bg-group-slate",
};

export function GroupDot({ color, className }: { color: GroupColor; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", SWATCH[color], className)} />;
}

/** The colour is never shown alone: the group's name is always written next to it. */
export function GroupBadge({ group, className }: { group: GroupTag; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded border border-border px-1 text-xs leading-tight", className)}>
      <GroupDot color={group.color} />
      <span className="truncate">{group.name}</span>
    </span>
  );
}

type ColorPickerProps = {
  name: string;
  value: GroupColor;
  onChange: (color: GroupColor) => void;
  disabled?: boolean;
};

/** Radio buttons of the fixed palette, each named (« Bleu », « Vert »…) for screen readers. */
export function ColorPicker({ name, value, onChange, disabled }: ColorPickerProps) {
  return (
    <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
      <legend className="sr-only">Couleur</legend>
      {GROUP_COLORS.map((color) => (
        <label key={color} className="relative cursor-pointer" title={GROUP_COLOR_LABELS[color]}>
          <input
            type="radio"
            name={name}
            value={color}
            checked={value === color}
            onChange={() => onChange(color)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-checked:ring-2 peer-checked:ring-foreground",
              SWATCH[color],
            )}
          >
            {value === color && <Check className="h-4 w-4 text-background" aria-hidden="true" />}
          </span>
          <span className="sr-only">{GROUP_COLOR_LABELS[color]}</span>
        </label>
      ))}
    </fieldset>
  );
}

type GroupFilterProps = {
  groups: readonly (GroupTag & { readonly count: number })[];
  value: string | null;
  total: number;
  onChange: (groupId: string | null) => void;
};

/** « Tous » or one group: toggle buttons, the chosen one marked by shape and aria-pressed, not colour alone. */
export function GroupFilter({ groups, value, total, onChange }: GroupFilterProps) {
  const chip = (isOn: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
      isOn ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
    );
  return (
    <div role="group" aria-label="Afficher un groupe" className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        Tous ({total})
      </button>
      {groups.map((g) => (
        <button key={g.id} type="button" aria-pressed={value === g.id} className={chip(value === g.id)} onClick={() => onChange(g.id)}>
          <GroupDot color={g.color} />
          {g.name} ({g.count})
        </button>
      ))}
    </div>
  );
}

"use client";

import { useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupTag } from "@/lib/agenda/groups-rules";
import { searchPersons } from "@/lib/agenda/participant-search";
import { GroupBadge, GroupDot } from "../group-badge";
import type { PersonOption } from "./shared-contracts";

type Props = {
  readonly persons: readonly PersonOption[];
  readonly value: readonly string[];
  readonly onChange: (ids: string[]) => void;
  /** Hint read with the search bar. */
  readonly describedBy?: string;
  readonly label?: string;
};

/** The groups present among the persons, in their first-seen order. */
function groupsOf(persons: readonly PersonOption[]): GroupTag[] {
  const seen = new Map<string, GroupTag>();
  for (const p of persons) if (p.group && !seen.has(p.group.id)) seen.set(p.group.id, p.group);
  return [...seen.values()];
}

const personsLabel = (n: number) => `${n} personne${n > 1 ? "s" : ""}`;

/**
 * « Avec qui ? » (Thomas, 2026-11-02): a search bar with suggestions and group
 * filters, instead of a long list to scroll. ARIA combobox: arrows move in the
 * suggestions, Entrée picks, Échap closes; the number of results is announced.
 */
export function ParticipantPicker({ persons, value, onChange, describedBy, label = "Rechercher une personne" }: Props) {
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const groups = groupsOf(persons);
  const chosen = value.flatMap((id) => persons.filter((p) => p.id === id));
  const { matches, total } = searchPersons(persons, query, { groupId, exclude: new Set(value) });
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));
  const showList = isOpen && (query.trim() !== "" || groupId !== null || matches.length > 0);

  function pick(person: PersonOption) {
    onChange([...value, person.id]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
    inputRef.current?.focus();
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setActive(0);
    setIsOpen(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((matches.length + activeIndex + step) % Math.max(matches.length, 1));
    } else if (event.key === "Enter" && showList) {
      // Never submits the appointment form from the search bar.
      event.preventDefault();
      const person = matches[activeIndex];
      if (person) pick(person);
    } else if (event.key === "Escape" && showList) {
      // The dialog stays open (appointment-dialog.tsx handleEscape).
      setIsOpen(false);
    } else if (event.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function handleFilter(id: string | null) {
    setGroupId(id);
    setActive(0);
    setIsOpen(true);
    inputRef.current?.focus();
  }

  if (persons.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune personne dans l&apos;agenda pour l&apos;instant.</p>;
  }

  const activeId = showList && matches[activeIndex] ? `${baseId}-opt-${matches[activeIndex].id}` : undefined;
  return (
    <div className="space-y-2">
      {groups.length > 1 && <GroupFilters groups={groups} value={groupId} onChange={handleFilter} />}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-describedby={describedBy}
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          placeholder="Tapez un nom…"
          autoComplete="off"
          className="flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {showList && (
          <Suggestions
            listId={listId}
            baseId={baseId}
            matches={matches}
            total={total}
            activeIndex={activeIndex}
            onPick={pick}
            onHover={setActive}
          />
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {showList ? (total === 0 ? "Aucune personne trouvée" : `${personsLabel(total)} trouvée${total > 1 ? "s" : ""}`) : ""}
      </p>

      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Personnes choisies">
          {chosen.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 pl-3 pr-1 text-sm">
              {p.group && <GroupDot color={p.group.color} />}
              {p.fullName}
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="rounded-full p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Retirer ${p.fullName}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SuggestionsProps = {
  readonly listId: string;
  readonly baseId: string;
  readonly matches: readonly PersonOption[];
  readonly total: number;
  readonly activeIndex: number;
  readonly onPick: (person: PersonOption) => void;
  readonly onHover: (index: number) => void;
};

function Suggestions({ listId, baseId, matches, total, activeIndex, onPick, onHover }: SuggestionsProps) {
  return (
    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
      {matches.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucune personne trouvée.</p>
      ) : (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="max-h-64 overflow-y-auto">
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${baseId}-opt-${p.id}`}
              role="option"
              aria-selected={i === activeIndex}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(p);
              }}
              onMouseEnter={() => onHover(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm", i === activeIndex && "bg-muted")}
            >
              <span className="min-w-0 truncate">
                {p.fullName}
                {p.detail && <span className="ml-1.5 text-xs text-muted-foreground">{p.detail}</span>}
              </span>
              {p.group && <GroupBadge group={p.group} className="shrink-0" />}
            </li>
          ))}
        </ul>
      )}
      {total > matches.length && (
        <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">
          … et {total - matches.length} autre{total - matches.length > 1 ? "s" : ""} : précisez la recherche.
        </p>
      )}
    </div>
  );
}

type FiltersProps = {
  readonly groups: readonly GroupTag[];
  readonly value: string | null;
  readonly onChange: (groupId: string | null) => void;
};

function GroupFilters({ groups, value, onChange }: FiltersProps) {
  const chip = (isOn: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
      isOn ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
    );
  return (
    <div role="group" aria-label="Chercher dans un groupe" className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        Tous
      </button>
      {groups.map((g) => (
        <button key={g.id} type="button" aria-pressed={value === g.id} className={chip(value === g.id)} onClick={() => onChange(g.id)}>
          <GroupDot color={g.color} />
          {g.name}
        </button>
      ))}
    </div>
  );
}

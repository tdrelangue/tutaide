"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PRECISION_LABELS, type GeocodedAddress } from "@/lib/agenda/geocode";
import type { Place } from "@/lib/agenda/service";
import { searchAgendaAddress } from "./actions";

const MIN_QUERY = 3;

/** Error text: red-700 keeps 4.5:1 on white (the global destructive token is lighter). */
export const ERROR_TEXT = "text-sm font-medium text-red-700";

/**
 * Address chosen from the IGN geocoder's suggestions, so every saved address
 * has coordinates. Search runs on demand (button / Enter), not on each key.
 * `onPendingChange` tells the form when text is typed but no address picked
 * yet, so saving can warn instead of silently dropping it.
 */
export function AddressField({
  label,
  value,
  onChange,
  onPendingChange,
  disabled,
  hint,
}: {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  onPendingChange?: (isPending: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes once the view switches (the clicked control unmounts). */
  const focusNext = useRef<"input" | "change" | null>(null);
  const [isEditing, setIsEditing] = useState(value === null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodedAddress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const target = focusNext.current === "input" ? inputRef.current : focusNext.current === "change" ? changeRef.current : null;
    focusNext.current = null;
    target?.focus();
  }, [isEditing]);

  function updateQuery(next: string) {
    setQuery(next);
    onPendingChange?.(next.trim().length > 0);
  }

  async function runSearch() {
    if (query.trim().length < MIN_QUERY) return;
    setIsSearching(true);
    setError(null);
    setAnnouncement("Recherche en cours");
    try {
      const result = await searchAgendaAddress(query);
      if (result.ok) {
        setResults(result.results);
        const n = result.results.length;
        setAnnouncement(n === 0 ? "Aucune adresse trouvée" : `${n} adresse${n > 1 ? "s trouvées" : " trouvée"}`);
      } else {
        setError(result.error);
        setAnnouncement("");
      }
    } catch {
      setError("Recherche d'adresse impossible. Réessayez.");
    } finally {
      setIsSearching(false);
    }
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    updateQuery(event.target.value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void runSearch();
  }

  function handlePick(address: GeocodedAddress) {
    onChange({ label: address.label, lat: address.lat, lon: address.lon, precision: address.precision });
    setResults(null);
    updateQuery("");
    setAnnouncement(`Adresse choisie : ${address.label}`);
    focusNext.current = "change";
    setIsEditing(false);
  }

  function handleChange() {
    updateQuery(value?.label ?? "");
    focusNext.current = "input";
    setIsEditing(true);
  }

  function handleClear() {
    onChange(null);
    setAnnouncement("Adresse effacée");
    focusNext.current = "input";
    setIsEditing(true);
  }

  function handleKeep() {
    updateQuery("");
    setResults(null);
    focusNext.current = "change";
    setIsEditing(false);
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <p role="status" className="sr-only">{announcement}</p>

      {!isEditing && value && (
        <div className="space-y-1 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span id={`${id}-value`} className="text-sm">{value.label}</span>
            <PrecisionBadge precision={value.precision} />
            <div className="ml-auto flex gap-2">
              <Button ref={changeRef} type="button" variant="outline" size="sm" onClick={handleChange} aria-describedby={`${id}-value`}>
                Changer
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClear} aria-describedby={`${id}-value`}>
                Effacer
              </Button>
            </div>
          </div>
          {value.precision !== "housenumber" && (
            <p className="text-sm text-muted-foreground">
              Sans numéro, le trajet est calculé jusqu&apos;au milieu de la rue ou de la commune.
              Choisissez une adresse avec numéro si possible.
            </p>
          )}
        </div>
      )}

      {isEditing && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label htmlFor={`${id}-q`} className="sr-only">
              {label} : rechercher une adresse
            </label>
            <Input
              ref={inputRef}
              id={`${id}-q`}
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              placeholder="ex. 12 rue de la Monnaie, Lille"
              autoComplete="off"
              aria-describedby={`${id}-hint`}
            />
            <Button type="button" variant="outline" onClick={runSearch} disabled={isSearching || query.trim().length < MIN_QUERY}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              <span className="ml-2">Rechercher</span>
            </Button>
          </div>
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            Numéro, rue et commune ({MIN_QUERY} caractères minimum), puis choisissez l&apos;adresse dans la liste.
          </p>
          {error && <p role="alert" className={ERROR_TEXT}>{error}</p>}
          {results !== null && results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune adresse trouvée. Vérifiez l&apos;orthographe ou ajoutez la commune.
            </p>
          )}
          {results !== null && results.length > 0 && (
            <ul className="space-y-1" aria-label="Adresses trouvées">
              {results.map((address) => (
                <li key={`${address.label}-${address.lat}-${address.lon}`}>
                  <button
                    type="button"
                    onClick={() => handlePick(address)}
                    className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{address.label}</span>
                    <PrecisionBadge precision={address.precision} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={handleKeep}>
              Garder l&apos;adresse actuelle
            </Button>
          )}
        </div>
      )}
    </fieldset>
  );
}

export function PrecisionBadge({ precision }: { precision: Place["precision"] }) {
  if (precision === "housenumber") {
    return <Badge variant="outline" className="text-xs">{PRECISION_LABELS[precision]}</Badge>;
  }
  return (
    <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-xs text-amber-900">
      {PRECISION_LABELS[precision]}
    </Badge>
  );
}

/** Message shown when an address was typed but not chosen from the list. */
export const PENDING_ADDRESS_ERROR =
  "Une adresse a été saisie sans être choisie dans la liste : cliquez sur « Rechercher » puis sur l'adresse, ou videz le champ.";

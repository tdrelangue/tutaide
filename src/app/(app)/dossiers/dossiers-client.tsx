"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, SortAsc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DossierCard } from "./dossier-card";
import { DossierSheet } from "./dossier-sheet";
import { CreateDossierDialog } from "./create-dossier-dialog";
import type { DossierWithDocuments } from "./actions";

interface DossiersPageClientProps {
  initialDossiers: DossierWithDocuments[];
  initialSearch: string;
  initialPriority?: "NORMAL" | "PRIORITAIRE" | "URGENT";
  initialSort: string;
}

export function DossiersPageClient({
  initialDossiers,
  initialSearch,
  initialPriority,
  initialSort,
}: DossiersPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedDossier, setSelectedDossier] = useState<DossierWithDocuments | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState(initialSearch);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      router.push(`/dossiers?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    // Debounce the search
    const timeoutId = setTimeout(() => {
      updateParams({ search: value || undefined });
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  const handlePriorityChange = (value: string) => {
    updateParams({ priority: value || undefined });
  };

  const handleSortChange = (value: string) => {
    updateParams({ sort: value });
  };

  const handleSelectDossier = (dossier: DossierWithDocuments) => {
    setSelectedDossier(dossier);
  };

  const handleCloseSheet = () => {
    setSelectedDossier(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Dossiers</h2>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Créer un dossier
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b px-6 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Rechercher un dossier..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
              aria-label="Rechercher un dossier"
            />
          </div>

          {/* Priority filter */}
          <ToggleGroup
            type="single"
            value={initialPriority || ""}
            onValueChange={handlePriorityChange}
            aria-label="Filtrer par priorité"
          >
            <ToggleGroupItem value="" aria-label="Toutes les priorités">
              Tous
            </ToggleGroupItem>
            <ToggleGroupItem value="NORMAL" aria-label="Priorité normale">
              Normal
            </ToggleGroupItem>
            <ToggleGroupItem value="PRIORITAIRE" aria-label="Prioritaire">
              Prioritaire
            </ToggleGroupItem>
            <ToggleGroupItem value="URGENT" aria-label="Urgent">
              Urgent
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Sort */}
          <Select value={initialSort} onValueChange={handleSortChange}>
            <SelectTrigger className="w-48" aria-label="Trier par">
              <SortAsc className="mr-2 h-4 w-4" aria-hidden="true" />
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">Activité récente</SelectItem>
              <SelectItem value="updatedAt-asc">Activité ancienne</SelectItem>
              <SelectItem value="fullName-asc">Nom A-Z</SelectItem>
              <SelectItem value="fullName-desc">Nom Z-A</SelectItem>
              <SelectItem value="priority-desc">Priorité haute</SelectItem>
              <SelectItem value="priority-asc">Priorité basse</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {initialDossiers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {search || initialPriority
                ? "Aucun dossier ne correspond à vos critères"
                : "Vous n'avez pas encore de dossier"}
            </p>
            {!search && !initialPriority && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Créer votre premier dossier
              </Button>
            )}
          </div>
        ) : (
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="list"
            aria-label="Liste des dossiers"
          >
            {initialDossiers.map((dossier) => (
              <DossierCard
                key={dossier.id}
                dossier={dossier}
                onSelect={() => handleSelectDossier(dossier)}
                isSelected={selectedDossier?.id === dossier.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Details Sheet */}
      <DossierSheet
        dossier={selectedDossier}
        open={!!selectedDossier}
        onClose={handleCloseSheet}
      />

      {/* Create Dialog */}
      <CreateDossierDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </div>
  );
}

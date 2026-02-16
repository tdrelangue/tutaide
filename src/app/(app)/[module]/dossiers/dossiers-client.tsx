"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, SortAsc, Send, CheckSquare, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DossierCard } from "./dossier-card";
import { DossierSheet } from "./dossier-sheet";
import { CreateDossierDialog } from "./create-dossier-dialog";
import { BulkSendDialog } from "./bulk-send-dialog";
import type { DossierWithDocuments } from "./actions";

interface DossiersPageClientProps {
  moduleType: "APA" | "ASH";
  initialDossiers: DossierWithDocuments[];
  initialSearch: string;
  initialStatus?: "ACTIVE" | "CLOSED";
  initialSort: string;
}

export function DossiersPageClient({
  moduleType,
  initialDossiers,
  initialSearch,
  initialStatus,
  initialSort,
}: DossiersPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedDossier, setSelectedDossier] =
    useState<DossierWithDocuments | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState(initialSearch);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSendOpen, setIsBulkSendOpen] = useState(false);

  const basePath = `/${moduleType.toLowerCase()}/dossiers`;

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
      router.push(`${basePath}?${params.toString()}`);
    },
    [router, searchParams, basePath]
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      updateParams({ search: value || undefined });
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  const handleStatusChange = (value: string) => {
    updateParams({ status: value === "ALL" ? undefined : value });
  };

  const handleSortChange = (value: string) => {
    updateParams({ sort: value });
  };

  const handleSelectDossier = (dossier: DossierWithDocuments) => {
    if (selectionMode) return;
    setSelectedDossier(dossier);
  };

  const handleCloseSheet = () => {
    setSelectedDossier(null);
  };

  // Bulk selection handlers
  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectedIds(new Set());
    }
    setSelectionMode((prev) => !prev);
  };

  const handleToggleCheck = (dossierId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(dossierId)) {
        next.delete(dossierId);
      } else {
        next.add(dossierId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(initialDossiers.map((d) => d.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const selectedDossiers = initialDossiers
    .filter((d) => selectedIds.has(d.id))
    .map((d) => ({
      id: d.id,
      fullName: d.fullName,
      primaryEmail: d.primaryEmail,
    }));

  // Determine empty state message
  const getEmptyStateMessage = () => {
    if (search) {
      return "Aucun dossier ne correspond a votre recherche";
    }
    if (initialStatus === "ACTIVE") {
      return "Aucun dossier actif";
    }
    if (initialStatus === "CLOSED") {
      return "Aucun dossier cloture";
    }
    return `Vous n'avez pas encore de dossier ${moduleType}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold tracking-tight">
            Dossiers
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant={selectionMode ? "secondary" : "outline"}
              onClick={toggleSelectionMode}
            >
              <CheckSquare className="mr-2 h-4 w-4" aria-hidden="true" />
              {selectionMode ? "Quitter la selection" : "Mode selection"}
            </Button>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nouveau dossier
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk selection toolbar */}
      {selectionMode && (
        <div className="border-b bg-muted/50 px-6 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                Tout selectionner
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
              >
                Tout deselectionner
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} dossier{selectedIds.size !== 1 ? "s" : ""}{" "}
                selectionne{selectedIds.size !== 1 ? "s" : ""}
              </span>
            </div>
            <Button
              disabled={selectedIds.size === 0}
              onClick={() => setIsBulkSendOpen(true)}
            >
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              Envoi groupe ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

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

          {/* Status filter */}
          <Select
            value={initialStatus || "ALL"}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-36" aria-label="Filtrer par statut">
              <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous</SelectItem>
              <SelectItem value="ACTIVE">Actifs</SelectItem>
              <SelectItem value="CLOSED">Clotures</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={initialSort} onValueChange={handleSortChange}>
            <SelectTrigger className="w-48" aria-label="Trier par">
              <SortAsc className="mr-2 h-4 w-4" aria-hidden="true" />
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">Activite recente</SelectItem>
              <SelectItem value="updatedAt-asc">Activite ancienne</SelectItem>
              <SelectItem value="fullName-asc">Nom A-Z</SelectItem>
              <SelectItem value="fullName-desc">Nom Z-A</SelectItem>
              <SelectItem value="priority-desc">Priorite haute</SelectItem>
              <SelectItem value="priority-asc">Priorite basse</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {initialDossiers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {getEmptyStateMessage()}
            </p>
            {!search && !initialStatus && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Creer votre premier dossier
              </Button>
            )}
          </div>
        ) : (
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="list"
            aria-label={`Liste des dossiers ${moduleType}`}
          >
            {initialDossiers.map((dossier) => (
              <DossierCard
                key={dossier.id}
                dossier={dossier}
                onSelect={() => handleSelectDossier(dossier)}
                isSelected={selectedDossier?.id === dossier.id}
                selectionMode={selectionMode}
                isChecked={selectedIds.has(dossier.id)}
                onToggleCheck={() => handleToggleCheck(dossier.id)}
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
        moduleType={moduleType}
      />

      {/* Create Dialog */}
      <CreateDossierDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        moduleType={moduleType}
      />

      {/* Bulk Send Dialog */}
      <BulkSendDialog
        open={isBulkSendOpen}
        onOpenChange={setIsBulkSendOpen}
        moduleType={moduleType}
        selectedDossiers={selectedDossiers}
      />
    </div>
  );
}

import { Suspense } from "react";
import { getDossiers } from "./actions";
import { DossiersPageClient } from "./dossiers-client";

interface DossiersPageProps {
  searchParams: Promise<{
    search?: string;
    priority?: string;
    sort?: string;
  }>;
}

export default async function DossiersPage({ searchParams }: DossiersPageProps) {
  const params = await searchParams;

  const priority = params.priority as "NORMAL" | "PRIORITAIRE" | "URGENT" | undefined;
  const sortBy = (params.sort?.split("-")[0] || "updatedAt") as "updatedAt" | "fullName" | "priority";
  const sortOrder = (params.sort?.split("-")[1] || "desc") as "asc" | "desc";

  const dossiers = await getDossiers({
    search: params.search,
    priority,
    sortBy,
    sortOrder,
  });

  return (
    <Suspense fallback={<DossiersLoading />}>
      <DossiersPageClient
        initialDossiers={dossiers}
        initialSearch={params.search || ""}
        initialPriority={priority}
        initialSort={`${sortBy}-${sortOrder}`}
      />
    </Suspense>
  );
}

function DossiersLoading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-1/3 bg-muted rounded" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

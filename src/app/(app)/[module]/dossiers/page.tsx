import { Suspense } from "react";
import { getDossiers } from "./actions";
import { DossiersPageClient } from "./dossiers-client";

interface DossiersPageProps {
  params: Promise<{ module: string }>;
  searchParams: Promise<{
    search?: string;
    status?: string;
    sort?: string;
  }>;
}

export default async function DossiersPage({
  params,
  searchParams,
}: DossiersPageProps) {
  const { module } = await params;
  const sp = await searchParams;

  const moduleType = module.toUpperCase() as "APA" | "ASH";

  const status = sp.status as "ACTIVE" | "CLOSED" | undefined;
  const sortBy = (sp.sort?.split("-")[0] || "updatedAt") as
    | "updatedAt"
    | "fullName"
    | "priority";
  const sortOrder = (sp.sort?.split("-")[1] || "desc") as "asc" | "desc";

  const dossiers = await getDossiers(moduleType, {
    search: sp.search,
    status,
    sortBy,
    sortOrder,
  });

  return (
    <Suspense fallback={<DossiersLoading />}>
      <DossiersPageClient
        moduleType={moduleType}
        initialDossiers={dossiers}
        initialSearch={sp.search || ""}
        initialStatus={status}
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

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getModuleEmailHistory } from "./actions";
import { HistoryClient } from "./history-client";

const VALID_MODULES = ["apa", "ash"] as const;

function toModuleType(slug: string): "APA" | "ASH" {
  return slug.toUpperCase() as "APA" | "ASH";
}

export default async function ModuleHistoryPage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;

  if (!VALID_MODULES.includes(module as (typeof VALID_MODULES)[number])) {
    notFound();
  }

  const moduleType = toModuleType(module);
  const events = await getModuleEmailHistory(moduleType);

  return (
    <Suspense fallback={<HistoryLoading />}>
      <HistoryClient events={events} moduleType={moduleType} />
    </Suspense>
  );
}

function HistoryLoading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/3 bg-muted rounded" />
        <div className="h-4 w-1/5 bg-muted rounded" />
        <div className="space-y-3 mt-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

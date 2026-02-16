import { Suspense } from "react";
import { getEmailHistory } from "./actions";
import { HistoryPageClient } from "./history-client";

export default async function HistoryPage() {
  const history = await getEmailHistory();

  return (
    <Suspense fallback={<HistoryLoading />}>
      <HistoryPageClient initialHistory={history} />
    </Suspense>
  );
}

function HistoryLoading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/4 bg-muted rounded" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { getGlobalTemplates } from "../actions";
import { GlobalTemplatesClient } from "./global-templates-client";

export default async function AdminTemplatesPage() {
  const templates = await getGlobalTemplates();

  return (
    <Suspense fallback={<div className="p-6 animate-pulse"><div className="h-64 bg-muted rounded-lg" /></div>}>
      <GlobalTemplatesClient initialTemplates={templates} />
    </Suspense>
  );
}

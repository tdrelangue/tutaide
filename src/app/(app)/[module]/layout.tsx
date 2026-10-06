import { notFound, redirect } from "next/navigation";
import { ModuleNav } from "./module-nav";
import { currentUserWorksOnDossiers } from "@/lib/access/context";
import { getMandataireContext } from "@/lib/access/selection-actions";

const VALID_MODULES = ["apa", "ash", "pch"] as const;
type Module = (typeof VALID_MODULES)[number];

const MODULE_LABELS: Record<Module, string> = {
  apa: "APA",
  ash: "ASH",
  pch: "PCH",
};

function isValidModule(value: string): value is Module {
  return VALID_MODULES.includes(value as Module);
}

export default async function ModuleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;

  if (!isValidModule(module)) {
    notFound();
  }

  // An organisation admin without a working role (e.g. IT) has no access to
  // dossiers: their place is the organisation panel.
  if (!(await currentUserWorksOnDossiers())) {
    redirect("/structure");
  }

  const moduleLabel = MODULE_LABELS[module];
  const mandataires = await getMandataireContext();

  return (
    <div className="flex flex-1 flex-col">
      <ModuleNav module={module} moduleLabel={moduleLabel} mandataires={mandataires} />
      {children}
    </div>
  );
}

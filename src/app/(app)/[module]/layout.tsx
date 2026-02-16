import { notFound } from "next/navigation";
import { ModuleNav } from "./module-nav";

const VALID_MODULES = ["apa", "ash"] as const;
type Module = (typeof VALID_MODULES)[number];

const MODULE_LABELS: Record<Module, string> = {
  apa: "APA",
  ash: "ASH",
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

  const moduleLabel = MODULE_LABELS[module];

  return (
    <div className="flex flex-1 flex-col">
      <ModuleNav module={module} moduleLabel={moduleLabel} />
      {children}
    </div>
  );
}

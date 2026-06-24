import { getAllModuleConfigs } from "@/app/(app)/settings/actions";
import { FolderOpen, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { UpdateCheckButton } from "./update-check-button";
import pkg from "../../../../package.json";

const MODULE_META: Record<
  string,
  { label: string; description: string; href: string; accent: string; badge: string }
> = {
  apa: {
    label: "APA",
    description: "Allocation Personnalisée d'Autonomie",
    href: "/apa/dossiers",
    accent: "bg-blue-600",
    badge: "bg-blue-100 text-blue-800",
  },
  ash: {
    label: "ASH",
    description: "Aide Sociale à l'Hébergement",
    href: "/ash/dossiers",
    accent: "bg-emerald-600",
    badge: "bg-emerald-100 text-emerald-800",
  },
  pch: {
    label: "PCH",
    description: "Prestation de Compensation du Handicap",
    href: "/pch/dossiers",
    accent: "bg-violet-600",
    badge: "bg-violet-100 text-violet-800",
  },
};

export default async function DashboardPage() {
  const moduleConfigs = await getAllModuleConfigs();

  const activeModules = (
    Object.entries(moduleConfigs) as [string, { destinationEmail: string } | null][]
  ).filter(([, config]) => config !== null);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">Vue d&apos;ensemble de votre espace Tutellia</p>
      </div>

      {/* Active modules */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Modules actifs
        </h2>
        {activeModules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
            Aucun module configuré. Rendez-vous dans les{" "}
            <a href="/settings" className="underline underline-offset-2 hover:text-foreground">
              Paramètres
            </a>{" "}
            pour configurer vos modules.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeModules.map(([key, config]) => {
              const meta = MODULE_META[key];
              if (!meta) return null;
              return (
                <a
                  key={key}
                  href={meta.href}
                  className="group flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-sm font-semibold",
                        meta.badge
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", meta.accent)} aria-hidden="true" />
                      {meta.label}
                    </span>
                    <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{meta.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {config?.destinationEmail}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* Updates */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Mises à jour
        </h2>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Tutellia v{pkg.version}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Les mises à jour sont vérifiées automatiquement au démarrage.
                </p>
              </div>
            </div>
            <UpdateCheckButton />
          </div>
        </div>
      </section>
    </div>
  );
}

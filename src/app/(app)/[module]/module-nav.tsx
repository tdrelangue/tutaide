"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleNavProps {
  module: string;
  moduleLabel: string;
}

const tabs = [
  {
    segment: "dossiers",
    icon: FolderOpen,
    label: "Dossiers",
  },
  {
    segment: "history",
    icon: History,
    label: "Historique",
  },
];

// Module-specific styling
const moduleStyles: Record<string, { badge: string; indicator: string }> = {
  apa: {
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    indicator: "bg-blue-600",
  },
  ash: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    indicator: "bg-emerald-600",
  },
};

export function ModuleNav({ module, moduleLabel }: ModuleNavProps) {
  const pathname = usePathname();
  const styles = moduleStyles[module] || moduleStyles.apa;

  return (
    <div className="border-b bg-background">
      <div className="flex h-12 items-center gap-6 px-6">
        {/* Module badge - clearly non-interactive */}
        <h1
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-semibold select-none m-0",
            styles.badge
          )}
        >
          <span
            className={cn("h-2 w-2 rounded-full", styles.indicator)}
            aria-hidden="true"
          />
          {moduleLabel}
        </h1>

        {/* Separator */}
        <div className="h-6 w-px bg-border" aria-hidden="true" />

        {/* Page tabs navigation */}
        <nav
          aria-label={`Sections ${moduleLabel}`}
          className="flex h-full items-center"
        >
          {tabs.map((tab) => {
            const href = `/${module}/${tab.segment}`;
            const isActive = pathname.startsWith(href);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.segment}
                href={href}
                className={cn(
                  "relative flex items-center gap-2 h-full px-4 text-sm font-medium transition-colors",
                  "hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
                {/* Active indicator - bottom border */}
                {isActive && (
                  <span
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-0.5 rounded-t-full",
                      styles.indicator
                    )}
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

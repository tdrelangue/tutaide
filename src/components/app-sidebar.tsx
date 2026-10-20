"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, FolderOpen, Settings, ShieldCheck, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: typeof FolderOpen;
  label: string;
  shortLabel: string;
  description: string;
  /** Prefix used to determine active state from pathname */
  activePrefix: string;
  /** Accent color for the module indicator */
  accentClass?: string;
}

const dashboardItem: NavItem = {
  href: "/dashboard",
  icon: LayoutDashboard,
  label: "Tableau de bord",
  shortLabel: "Accueil",
  description: "Vue d'ensemble",
  activePrefix: "/dashboard",
};

const moduleItems: NavItem[] = [
  {
    href: "/apa/dossiers",
    icon: FolderOpen,
    label: "APA - Allocation personnalisee d'autonomie",
    shortLabel: "APA",
    description: "Dossiers APA",
    activePrefix: "/apa",
    accentClass: "bg-blue-600",
  },
  {
    href: "/ash/dossiers",
    icon: FolderOpen,
    label: "ASH - Aide sociale a l'hebergement",
    shortLabel: "ASH",
    description: "Dossiers ASH",
    activePrefix: "/ash",
    accentClass: "bg-emerald-600",
  },
  {
    href: "/pch/dossiers",
    icon: FolderOpen,
    label: "PCH - Prestation de Compensation du Handicap",
    shortLabel: "PCH",
    description: "Dossiers PCH",
    activePrefix: "/pch",
    accentClass: "bg-violet-600",
  },
];

/** « Agenda » paid add-on: shown only to accounts that hold it. */
const agendaItem: NavItem = {
  href: "/agenda",
  icon: CalendarDays,
  label: "Agenda des visites",
  shortLabel: "Agenda",
  description: "Personnes à visiter et tournées",
  activePrefix: "/agenda",
};

const adminItem: NavItem = {
  href: "/admin/users",
  icon: ShieldCheck,
  label: "Administration",
  shortLabel: "Admin",
  description: "Gestion des utilisateurs",
  activePrefix: "/admin",
  accentClass: "bg-red-600",
};

const structureItem: NavItem = {
  href: "/structure",
  icon: Building2,
  label: "Administration de la structure",
  shortLabel: "Structure",
  description: "Membres et répartition",
  activePrefix: "/structure",
};

const settingsItem: NavItem = {
  href: "/settings",
  icon: Settings,
  label: "Parametres",
  shortLabel: "Param.",
  description: "Configuration generale",
  activePrefix: "/settings",
};

interface AppSidebarProps {
  userRole: "USER" | "ADMIN";
  activeModules: string[];
  /** False for an organisation admin without a working role (e.g. IT). */
  worksOnDossiers: boolean;
  isOrgAdmin: boolean;
  /** The « Agenda » add-on is active for this account (or one of the assistant's MJPMs). */
  showAgenda: boolean;
}

export function AppSidebar({ userRole, activeModules, worksOnDossiers, isOrgAdmin, showAgenda }: AppSidebarProps) {
  const pathname = usePathname();

  const visibleModules = worksOnDossiers
    ? moduleItems.filter((item) => activeModules.includes(item.activePrefix.replace("/", "")))
    : [];

  return (
    <nav
      aria-label="Navigation principale"
      data-tour="sidebar"
      className="sticky top-0 hidden h-screen w-24 flex-col border-r bg-muted/30 sm:flex"
    >
      {/* Logo at top */}
      <div className="flex h-16 items-center justify-center border-b">
        <Link
          href="/dashboard"
          className="flex h-11 w-11 items-center justify-center rounded-lg overflow-hidden transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Tutellia - Accueil"
        >
          <Image
            src="/icon.png"
            alt="Tutellia"
            width={44}
            height={44}
            className="object-contain"
            priority
            unoptimized
          />
        </Link>
      </div>

      {/* Dashboard */}
      <div className="pt-4 pb-1">
        <ul className="flex flex-col items-center gap-1 list-none p-0 m-0" role="list">
          {worksOnDossiers && (
            <SidebarItem
              item={dashboardItem}
              isActive={pathname.startsWith(dashboardItem.activePrefix)}
            />
          )}
          {isOrgAdmin && (
            <SidebarItem item={structureItem} isActive={pathname.startsWith("/structure")} />
          )}
        </ul>
      </div>

      {/* Active modules only */}
      <div className="flex-1 py-1">
        <ul className="flex flex-col items-center gap-1 list-none p-0 m-0" role="list">
          {visibleModules.map((item) => {
            const isActive = pathname.startsWith(item.activePrefix);
            return (
              <SidebarItem key={item.href} item={item} isActive={isActive} />
            );
          })}
          {showAgenda && (
            <SidebarItem item={agendaItem} isActive={pathname.startsWith(agendaItem.activePrefix)} />
          )}
        </ul>
      </div>

      {/* Settings + Admin pinned to bottom */}
      <div className="border-t py-4">
        <ul className="flex flex-col items-center gap-1 list-none p-0 m-0" role="list">
          {userRole === "ADMIN" && (
            <SidebarItem
              item={adminItem}
              isActive={pathname.startsWith("/admin")}
            />
          )}
          <SidebarItem
            item={settingsItem}
            isActive={pathname === "/settings" || pathname.startsWith("/settings")}
          />
        </ul>
      </div>
    </nav>
  );
}

/**
 * Phones: the same destinations as the sidebar, as a bar fixed at the bottom
 * of the screen (thumb reach). The sidebar is hidden under 640 px.
 */
export function MobileNavBar({ userRole, activeModules, worksOnDossiers, isOrgAdmin, showAgenda }: AppSidebarProps) {
  const pathname = usePathname();
  const items: NavItem[] = [
    ...(worksOnDossiers ? [dashboardItem] : []),
    ...(showAgenda ? [agendaItem] : []),
    ...(worksOnDossiers ? moduleItems.filter((item) => activeModules.includes(item.activePrefix.replace("/", ""))) : []),
    ...(isOrgAdmin ? [structureItem] : []),
    ...(userRole === "ADMIN" ? [adminItem] : []),
    settingsItem,
  ];
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden">
      <ul className="m-0 flex list-none overflow-x-auto p-0" role="list">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.activePrefix);
          return (
            <li key={item.href} className="min-w-16 flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", isActive && "bg-accent")}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {item.shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarItem({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <li className="w-full px-2">
      <Link
        href={item.href}
        className={cn(
          "relative flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-lg transition-all",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isActive && [
            "bg-accent text-accent-foreground",
            "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-10 before:w-1 before:rounded-r-full before:bg-primary",
          ]
        )}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
      >
        {/* Icon with accent indicator */}
        <div className="relative">
          <Icon className="h-5 w-5" aria-hidden="true" />
          {item.accentClass && (
            <span
              className={cn(
                "absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-background",
                item.accentClass
              )}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Explicit text label - always visible, larger font */}
        <span
          className={cn(
            "text-xs font-semibold leading-tight text-center",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {item.shortLabel}
        </span>
      </Link>
    </li>
  );
}

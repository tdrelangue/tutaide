"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { FolderOpen, Settings, ShieldCheck } from "lucide-react";
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
];

const adminItem: NavItem = {
  href: "/admin/users",
  icon: ShieldCheck,
  label: "Administration",
  shortLabel: "Admin",
  description: "Gestion des utilisateurs",
  activePrefix: "/admin",
  accentClass: "bg-red-600",
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
}

export function AppSidebar({ userRole }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="sticky top-0 h-screen flex w-24 flex-col border-r bg-muted/30"
    >
      {/* Logo at top */}
      <div className="flex h-16 items-center justify-center border-b">
        <Link
          href="/apa/dossiers"
          className="flex h-11 w-11 items-center justify-center rounded-lg overflow-hidden transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Tut'aide - Accueil"
        >
          <Image
            src="/icon.png"
            alt="Tut'aide"
            width={44}
            height={44}
            className="object-contain"
            priority
            unoptimized
          />
        </Link>
      </div>

      {/* Main modules */}
      <div className="flex-1 py-4">
        <ul className="flex flex-col items-center gap-1 list-none p-0 m-0" role="list">
          {moduleItems.map((item) => {
            const isActive = pathname.startsWith(item.activePrefix);
            return (
              <SidebarItem key={item.href} item={item} isActive={isActive} />
            );
          })}
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

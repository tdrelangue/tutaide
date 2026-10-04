"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getMyNotificationsAction, markMyNotificationsReadAction } from "@/lib/notification-actions";
import type { NotificationItem } from "@/lib/notifications";

const REFRESH_MS = 15 * 60 * 1000;

/**
 * Bell in the app header. Messages from the software admin, with an unread
 * counter. Never pops up on its own: users open it when they choose.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Ids that were unread when the panel opened, so they stay marked "Nouveau" while it is open.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const result = await getMyNotificationsAction();
    setItems(result.items);
    setUnread(result.unread);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [refresh]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFreshIds(new Set());
      return;
    }
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    setFreshIds(new Set(unreadIds));
    if (unreadIds.length === 0) return;
    setUnread(0);
    setItems((current) => current.map((n) => ({ ...n, read: true })));
    await markMyNotificationsReadAction(unreadIds);
  }

  function handleLinkClick() {
    setOpen(false);
  }

  const label = unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full" aria-label={label} data-tour="notifications">
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Aucune notification pour le moment.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className="space-y-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    {freshIds.has(n.id) && (
                      <span className="shrink-0 text-xs font-medium text-primary">Nouveau</span>
                    )}
                  </div>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
                  <div className="flex items-center justify-between pt-1">
                    <time dateTime={n.createdAt} className="text-xs text-muted-foreground">
                      {format(new Date(n.createdAt), "d MMMM yyyy", { locale: fr })}
                    </time>
                    {n.linkPath && (
                      <Link href={n.linkPath} onClick={handleLinkClick} className="text-sm font-medium underline-offset-4 hover:underline">
                        Ouvrir
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

"use server";

import { auth, getEffectiveUserId } from "./auth";
import {
  getNotificationsForUser,
  markNotificationsRead,
  type NotificationItem,
} from "./notifications";

/** Messages for the bell, for the effective user (the client, when impersonating). */
export async function getMyNotificationsAction(): Promise<{ items: NotificationItem[]; unread: number }> {
  try {
    const userId = await getEffectiveUserId();
    if (!userId) return { items: [], unread: 0 };
    return await getNotificationsForUser(userId);
  } catch {
    return { items: [], unread: 0 };
  }
}

/**
 * Marks messages as read once the user has opened the bell. Skipped while an
 * admin is impersonating, so the client still sees them as new.
 */
export async function markMyNotificationsReadAction(ids: string[]): Promise<void> {
  try {
    const session = await auth();
    const userId = await getEffectiveUserId();
    if (!userId || userId !== session?.user?.id) return;
    await markNotificationsRead(userId, ids.filter((id) => typeof id === "string").slice(0, 100));
  } catch {
    // Read state is a convenience; never break the page over it.
  }
}

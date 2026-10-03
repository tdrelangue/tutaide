import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { db } from "./db";
import type { PaymentReminder } from "./billing";

/**
 * In-app messages written by the software admin, shown under the bell in the
 * app header. A user sees messages posted after their account was created,
 * filtered by audience (ALL, or PAYING = accounts with billingRequired).
 */

const MAX_SHOWN = 30;

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  linkPath: string | null;
  createdAt: string;
  read: boolean;
};

export type AdminNotificationItem = Omit<NotificationItem, "read"> & {
  audience: "ALL" | "PAYING";
  readCount: number;
};

/** Only in-app paths, so a message can never send users to another site. */
export function isValidLinkPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !/\s/.test(value) && value.length <= 200;
}

export async function getNotificationsForUser(
  userId: string
): Promise<{ items: NotificationItem[]; unread: number }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, billingRequired: true },
  });
  if (!user) return { items: [], unread: 0 };

  const rows = await db.appNotification.findMany({
    where: {
      OR: [
        { targetUserId: userId },
        {
          targetUserId: null,
          createdAt: { gte: user.createdAt },
          ...(user.billingRequired ? {} : { audience: "ALL" as const }),
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: MAX_SHOWN,
    select: {
      id: true,
      title: true,
      body: true,
      linkPath: true,
      createdAt: true,
      reads: { where: { userId }, select: { userId: true } },
    },
  });

  const items = rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    linkPath: n.linkPath,
    createdAt: n.createdAt.toISOString(),
    read: n.reads.length > 0,
  }));
  return { items, unread: items.filter((n) => !n.read).length };
}

export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.notificationRead.createMany({
    data: ids.map((notificationId) => ({ userId, notificationId })),
    skipDuplicates: true,
  });
}

export async function listAllNotifications(): Promise<AdminNotificationItem[]> {
  const rows = await db.appNotification.findMany({
    where: { targetUserId: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      linkPath: true,
      audience: true,
      createdAt: true,
      _count: { select: { reads: true } },
    },
  });
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    linkPath: n.linkPath,
    audience: n.audience,
    createdAt: n.createdAt.toISOString(),
    readCount: n._count.reads,
  }));
}

export async function createNotification(data: {
  title: string;
  body: string;
  linkPath: string | null;
  audience: "ALL" | "PAYING";
  createdById: string;
}): Promise<void> {
  await db.appNotification.create({ data });
}

export async function deleteNotification(id: string): Promise<void> {
  await db.appNotification.deleteMany({ where: { id } });
}

const BILLING_LINK = "/settings?tab=abonnement";

function reminderText(reminder: PaymentReminder): { title: string; body: string } {
  const deadline = format(new Date(reminder.deadline), "d MMMM yyyy", { locale: fr });
  const left = `Il vous reste ${reminder.daysLeft} jour${reminder.daysLeft > 1 ? "s" : ""}, jusqu'au ${deadline}.`;
  const after = "Passé ce délai, l'accès à Tutellia sera suspendu jusqu'au règlement.";
  if (reminder.reason === "payment_failed") {
    return {
      title: "Votre moyen de paiement n'est plus valable",
      body: `Le dernier prélèvement de votre abonnement n'a pas abouti (carte expirée ou remplacée ?). Mettez à jour votre carte dans Paramètres › Abonnement. ${left} ${after}`,
    };
  }
  return {
    title: "Enregistrez votre carte bancaire",
    body: `Votre abonnement est arrivé à échéance et aucune carte n'est enregistrée. Enregistrez-la dans Paramètres › Abonnement. ${left} ${after}`,
  };
}

/**
 * During the 30-day payment grace, adds one personal reminder per day to the
 * user's bell (at most one per calendar day, however often the app is opened).
 */
export async function ensureDailyPaymentReminder(userId: string, reminder: PaymentReminder): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const existing = await db.appNotification.findFirst({
    where: { targetUserId: userId, createdAt: { gte: startOfToday } },
    select: { id: true },
  });
  if (existing) return;
  await db.appNotification.create({
    data: { ...reminderText(reminder), linkPath: BILLING_LINK, audience: "ALL", targetUserId: userId },
  });
}

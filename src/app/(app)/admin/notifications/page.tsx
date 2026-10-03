import { getAdminNotifications } from "../actions";
import { NotificationsAdmin } from "./notifications-admin";

export default async function AdminNotificationsPage() {
  const notifications = await getAdminNotifications();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h2 className="text-xl font-semibold tracking-tight">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Messages affichés sous la cloche, en haut de l&apos;application. Ils n&apos;apparaissent
          jamais en fenêtre surgissante : chacun les lit quand il ouvre la cloche.
        </p>
      </div>
      <div className="p-6 max-w-3xl">
        <NotificationsAdmin notifications={notifications} />
      </div>
    </div>
  );
}

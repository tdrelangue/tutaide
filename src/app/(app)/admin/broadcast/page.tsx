import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { BroadcastForm } from "./broadcast-form";

export default async function BroadcastPage() {
  const adminId = await requireAdmin();

  const [activeCount, hasSmtp] = await Promise.all([
    db.user.count({ where: { archivedAt: null } }),
    db.smtpConfig.findUnique({ where: { userId: adminId }, select: { id: true } }),
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Email à tous les utilisateurs
        </h2>
        <p className="text-sm text-muted-foreground">
          Envoie un email unique à tous les utilisateurs actifs ({activeCount}), depuis
          votre configuration SMTP personnelle.
        </p>
      </div>
      <div className="p-6 max-w-2xl">
        <BroadcastForm activeCount={activeCount} hasSmtp={!!hasSmtp} />
      </div>
    </div>
  );
}

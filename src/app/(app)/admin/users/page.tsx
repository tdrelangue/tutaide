import { Suspense } from "react";
import { getUsers } from "../actions";
import { listOrganizations } from "../organisations/actions";
import { UsersPageClient } from "./users-client";

export default async function AdminUsersPage() {
  const [users, organizations] = await Promise.all([getUsers(), listOrganizations()]);

  return (
    <Suspense fallback={<UsersLoading />}>
      <UsersPageClient initialUsers={users} organizations={organizations} />
    </Suspense>
  );
}

function UsersLoading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/4 bg-muted rounded" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

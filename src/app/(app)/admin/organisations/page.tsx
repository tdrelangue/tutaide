import { listOrganizations } from "./actions";
import { OrganizationsClient } from "./organizations-client";

export default async function AdminOrganizationsPage() {
  const organizations = await listOrganizations();
  return <OrganizationsClient organizations={organizations} />;
}

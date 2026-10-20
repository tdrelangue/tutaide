import { redirect } from "next/navigation";

/** Structures are now listed with the other clients (individuals and structures, one list). */
export default function AdminOrganizationsPage() {
  redirect("/admin/users");
}

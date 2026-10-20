"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Building2, FileText, KeyRound, Plus, Search, Send, Tags, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateUserDialog } from "./create-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { ImapFoldersDialog } from "./imap-folders-dialog";
import { archiveUser, unarchiveUser, startImpersonationAction } from "../actions";
import type { AdminUserData } from "../actions";
import type { OrgListItem } from "../organisations/actions";
import type { BillingOfferItem } from "../organisations/billing-actions";
import { OffersDialog, OrgBillingDialog } from "./billing-dialogs";
import { ArchiveDialog, AttachUserDialog, CreateOrganizationDialog, LicenseDialog, RenameDialog } from "../organisations/organization-dialogs";
import { StructureRow } from "./structure-row";
import type { OrgDialogKind, UserHandlers } from "./structure-row";
import { UserRow } from "./user-row";

type StatusFilter = "all" | "active" | "archived";
type KindFilter = "all" | "individuals" | "structures";
type OrgDialog = { kind: "create" } | { kind: "offers" } | { kind: OrgDialogKind; org: OrgListItem } | null;

/** A line of the client list: an individual MJPM, or a structure with its accounts. */
type ClientLine =
  | { readonly kind: "user"; readonly sortKey: string; readonly user: AdminUserData }
  | { readonly kind: "org"; readonly sortKey: string; readonly org: OrgListItem; readonly members: AdminUserData[]; readonly openByDefault: boolean };

interface UsersPageClientProps {
  initialUsers: AdminUserData[];
  organizations: OrgListItem[];
  offers: BillingOfferItem[];
}

/** Inside a structure: its administrators first, then by name. */
function byAdminThenName(a: AdminUserData, b: AdminUserData): number {
  if (a.isOrgAdmin !== b.isOrgAdmin) return a.isOrgAdmin ? -1 : 1;
  return (a.name || a.email).localeCompare(b.name || b.email, "fr");
}

function matchesUser(user: AdminUserData, search: string, status: StatusFilter): boolean {
  const q = search.trim().toLowerCase();
  const text = q === "" || user.email.toLowerCase().includes(q) || (user.name?.toLowerCase().includes(q) ?? false);
  const state = status === "all" || (status === "active" ? !user.archivedAt : !!user.archivedAt);
  return text && state;
}

/**
 * Individuals and structures in one list, sorted by name. A structure shows when
 * its name matches the search, or one of its accounts does (it then opens).
 */
function buildLines(users: AdminUserData[], orgs: OrgListItem[], search: string, status: StatusFilter, kind: KindFilter): ClientLine[] {
  const q = search.trim().toLowerCase();
  const individuals: ClientLine[] =
    kind === "structures"
      ? []
      : users.filter((u) => u.orgId === null && matchesUser(u, search, status)).map((user) => ({ kind: "user", sortKey: (user.name || user.email).toLowerCase(), user }));
  const structures: ClientLine[] =
    kind === "individuals"
      ? []
      : orgs.flatMap((org): ClientLine[] => {
          const nameMatches = q === "" || org.name.toLowerCase().includes(q);
          const members = users.filter((u) => u.orgId === org.id && matchesUser(u, nameMatches ? "" : search, status)).sort(byAdminThenName);
          if (!nameMatches && members.length === 0) return [];
          return [{ kind: "org", sortKey: org.name.toLowerCase(), org, members, openByDefault: q !== "" && !nameMatches }];
        });
  return [...individuals, ...structures].sort((a, b) => a.sortKey.localeCompare(b.sortKey, "fr"));
}

function useUserCommands() {
  const router = useRouter();
  async function report(result: { success: boolean; error?: string }, message: string) {
    if (result.success) {
      toast.success(message);
      router.refresh();
    } else {
      toast.error(result.error ?? "Erreur inattendue");
    }
  }
  async function archive(user: AdminUserData) {
    await report(await archiveUser(user.id), "Compte archivé");
  }
  async function unarchive(user: AdminUserData) {
    await report(await unarchiveUser(user.id), "Compte réactivé");
  }
  async function impersonate(user: AdminUserData) {
    const result = await startImpersonationAction(user.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.push("/apa/dossiers");
    router.refresh();
  }
  return { archive, unarchive, impersonate, refresh: () => router.refresh() };
}

export function UsersPageClient({ initialUsers, organizations, offers }: UsersPageClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserData | null>(null);
  const [imapUser, setImapUser] = useState<AdminUserData | null>(null);
  const [orgDialog, setOrgDialog] = useState<OrgDialog>(null);
  const commands = useUserCommands();
  const lines = buildLines(initialUsers, organizations, search, statusFilter, kindFilter);
  const handlers: UserHandlers = {
    onEdit: setEditUser,
    onArchive: commands.archive,
    onUnarchive: commands.unarchive,
    onImpersonate: commands.impersonate,
    onInspectImap: setImapUser,
  };

  function handleOrgAction(kind: OrgDialogKind, org: OrgListItem) {
    setOrgDialog({ kind, org });
  }

  function closeOrgDialog() {
    setOrgDialog(null);
  }

  function handleEditDone() {
    setEditUser(null);
    commands.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <ClientsHeader
        individuals={initialUsers.filter((u) => u.orgId === null && !u.archivedAt && u.role !== "ADMIN").length}
        structures={organizations.filter((o) => !o.archived).length}
        onCreateUser={() => setCreateOpen(true)}
        onCreateOrg={() => setOrgDialog({ kind: "create" })}
        onOffers={() => setOrgDialog({ kind: "offers" })}
      />
      <ClientsFilters search={search} onSearch={setSearch} status={statusFilter} onStatus={setStatusFilter} kind={kindFilter} onKind={setKindFilter} />

      <div className="flex-1 overflow-auto p-6">
        {lines.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-12 w-12 opacity-30" aria-hidden="true" />
            <p>Aucun client trouvé</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((line) =>
              line.kind === "user" ? (
                <UserRow
                  key={line.user.id}
                  user={line.user}
                  onEdit={() => handlers.onEdit(line.user)}
                  onArchive={() => handlers.onArchive(line.user)}
                  onUnarchive={() => handlers.onUnarchive(line.user)}
                  onImpersonate={() => handlers.onImpersonate(line.user)}
                  onInspectImap={() => handlers.onInspectImap(line.user)}
                />
              ) : (
                <StructureRow
                  key={`${line.org.id}-${line.openByDefault ? "open" : "closed"}`}
                  org={line.org}
                  members={line.members}
                  defaultOpen={line.openByDefault}
                  onOrgAction={handleOrgAction}
                  handlers={handlers}
                />
              ),
            )}
          </div>
        )}
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onComplete={commands.refresh} />
      {imapUser && (
        <ImapFoldersDialog userId={imapUser.id} userLabel={imapUser.name || imapUser.email} open={!!imapUser} onOpenChange={(open) => !open && setImapUser(null)} />
      )}
      {editUser && <EditUserDialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)} user={editUser} onComplete={handleEditDone} />}
      <CreateOrganizationDialog open={orgDialog?.kind === "create"} onClose={closeOrgDialog} />
      <RenameDialog org={orgDialog?.kind === "rename" ? orgDialog.org : null} onClose={closeOrgDialog} />
      <AttachUserDialog org={orgDialog?.kind === "attach" ? orgDialog.org : null} onClose={closeOrgDialog} />
      <ArchiveDialog org={orgDialog?.kind === "archive" ? orgDialog.org : null} onClose={closeOrgDialog} />
      <LicenseDialog org={orgDialog?.kind === "license" ? orgDialog.org : null} onClose={closeOrgDialog} />
      <OrgBillingDialog org={orgDialog?.kind === "billing" ? orgDialog.org : null} offers={offers} onClose={closeOrgDialog} />
      <OffersDialog open={orgDialog?.kind === "offers"} offers={offers} onClose={closeOrgDialog} />
    </div>
  );
}

type HeaderProps = { individuals: number; structures: number; onCreateUser: () => void; onCreateOrg: () => void; onOffers: () => void };

function ClientsHeader({ individuals, structures, onCreateUser, onCreateOrg, onOffers }: HeaderProps) {
  return (
    <div className="border-b px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
            <Users className="h-5 w-5 text-red-700 dark:text-red-300" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Clients</h2>
            <p className="text-sm text-muted-foreground">
              {individuals} individuel{individuals > 1 ? "s" : ""} · {structures} structure{structures > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminLink href="/admin/templates" icon={FileText} label="Modèles globaux" />
          <AdminLink href="/admin/system-config" icon={KeyRound} label="Configuration système" />
          <AdminLink href="/admin/notifications" icon={Bell} label="Notifications" />
          <AdminLink href="/admin/broadcast" icon={Send} label="Email à tous" />
          <Button variant="outline" onClick={onOffers}>
            <Tags className="mr-2 h-4 w-4" aria-hidden="true" />
            Offres types
          </Button>
          <Button variant="outline" onClick={onCreateOrg}>
            <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Nouvelle structure
          </Button>
          <Button onClick={onCreateUser}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nouvel utilisateur
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdminLink({ href, icon: Icon, label }: { href: string; icon: typeof Bell; label: string }) {
  return (
    <Button variant="outline" asChild>
      <Link href={href}>
        <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

type FiltersProps = {
  search: string;
  onSearch: (value: string) => void;
  status: StatusFilter;
  onStatus: (value: StatusFilter) => void;
  kind: KindFilter;
  onKind: (value: KindFilter) => void;
};

const STATUS_VALUES: readonly StatusFilter[] = ["all", "active", "archived"];
const KIND_VALUES: readonly KindFilter[] = ["all", "individuals", "structures"];

function ClientsFilters({ search, onSearch, status, onStatus, kind, onKind }: FiltersProps) {
  function handleStatus(value: string) {
    const next = STATUS_VALUES.find((v) => v === value);
    if (next) onStatus(next);
  }
  function handleKind(value: string) {
    const next = KIND_VALUES.find((v) => v === value);
    if (next) onKind(next);
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
      <div className="relative max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input placeholder="Rechercher un client, une structure, un email…" aria-label="Rechercher un client" value={search} onChange={(e) => onSearch(e.target.value)} className="pl-9" />
      </div>
      <Select value={kind} onValueChange={handleKind}>
        <SelectTrigger className="w-44" aria-label="Type de client">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les clients</SelectItem>
          <SelectItem value="individuals">Individuels</SelectItem>
          <SelectItem value="structures">Structures</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={handleStatus}>
        <SelectTrigger className="w-40" aria-label="État des comptes">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous</SelectItem>
          <SelectItem value="active">Actifs</SelectItem>
          <SelectItem value="archived">Archivés</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

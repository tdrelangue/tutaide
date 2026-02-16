"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Users,
  Plus,
  Search,
  Eye,
  Archive,
  ArchiveRestore,
  Pencil,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreateUserDialog } from "./create-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import {
  archiveUser,
  unarchiveUser,
  startImpersonationAction,
} from "../actions";
import type { AdminUserData } from "../actions";

interface UsersPageClientProps {
  initialUsers: AdminUserData[];
}

export function UsersPageClient({ initialUsers }: UsersPageClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserData | null>(null);

  const filteredUsers = initialUsers.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !user.archivedAt) ||
      (statusFilter === "archived" && !!user.archivedAt);
    return matchesSearch && matchesStatus;
  });

  async function handleArchive(userId: string) {
    const result = await archiveUser(userId);
    if (result.success) {
      toast.success("Compte archive");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleUnarchive(userId: string) {
    const result = await unarchiveUser(userId);
    if (result.success) {
      toast.success("Compte reactive");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleImpersonate(userId: string) {
    const result = await startImpersonationAction(userId);
    if (result.success) {
      router.push("/apa/dossiers");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const activeCount = initialUsers.filter((u) => !u.archivedAt).length;
  const archivedCount = initialUsers.filter((u) => !!u.archivedAt).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <Users className="h-5 w-5 text-red-700 dark:text-red-300" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Gestion des utilisateurs
              </h2>
              <p className="text-sm text-muted-foreground">
                {activeCount} actif{activeCount > 1 ? "s" : ""}
                {archivedCount > 0 && ` · ${archivedCount} archive${archivedCount > 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvel utilisateur
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | "active" | "archived")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="archived">Archives</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-auto p-6">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Aucun utilisateur trouve</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onEdit={() => setEditUser(user)}
                onArchive={() => handleArchive(user.id)}
                onUnarchive={() => handleUnarchive(user.id)}
                onImpersonate={() => handleImpersonate(user.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onComplete={() => router.refresh()}
      />
      {editUser && (
        <EditUserDialog
          open={!!editUser}
          onOpenChange={(open) => !open && setEditUser(null)}
          user={editUser}
          onComplete={() => {
            setEditUser(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function UserRow({
  user,
  onEdit,
  onArchive,
  onUnarchive,
  onImpersonate,
}: {
  user: AdminUserData;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onImpersonate: () => void;
}) {
  const isArchived = !!user.archivedAt;

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isArchived ? "bg-muted/50 opacity-75" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {/* Name + email */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">
              {user.name || user.email}
            </span>
            {user.role === "ADMIN" && (
              <Badge variant="destructive" className="text-xs gap-1">
                <ShieldCheck className="h-3 w-3" />
                Admin
              </Badge>
            )}
            {isArchived ? (
              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Archive
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                Actif
              </Badge>
            )}
          </div>
          {user.name && (
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          )}
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5" />
            {user._count.dossiers}
          </span>
          <span className="text-xs">
            {format(new Date(user.createdAt), "d MMM yyyy", { locale: fr })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Modifier</TooltipContent>
        </Tooltip>

        {!isArchived && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onImpersonate}>
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Visualiser le compte</TooltipContent>
          </Tooltip>
        )}

        {isArchived ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onUnarchive}>
                <ArchiveRestore className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reactiver</TooltipContent>
          </Tooltip>
        ) : (
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Archive className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Archiver</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archiver ce compte ?</AlertDialogTitle>
                <AlertDialogDescription>
                  L&apos;utilisateur <strong>{user.name || user.email}</strong> ne
                  pourra plus se connecter. Ses donnees seront conservees et le
                  compte pourra etre reactive ulterieurement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={onArchive}>
                  Archiver
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminNotificationItem } from "@/lib/notifications";
import { createNotificationAction, deleteNotificationAction } from "../actions";

/** In-app destinations offered for the "Ouvrir" button (no free-text URLs). */
const LINK_OPTIONS = [
  { value: "none", label: "Aucun lien", path: null },
  { value: "billing", label: "Paramètres › Abonnement", path: "/settings?tab=abonnement" },
  { value: "settings", label: "Paramètres", path: "/settings" },
  { value: "dashboard", label: "Tableau de bord", path: "/dashboard" },
  { value: "guides", label: "Guides", path: "/guides" },
] as const;

type LinkValue = (typeof LINK_OPTIONS)[number]["value"];

function linkLabel(path: string | null): string {
  return LINK_OPTIONS.find((o) => o.path === path)?.label ?? path ?? "Aucun lien";
}

export function NotificationsAdmin({ notifications }: { notifications: AdminNotificationItem[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState<LinkValue>("none");
  const [audience, setAudience] = useState<"ALL" | "PAYING">("ALL");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const path = LINK_OPTIONS.find((o) => o.value === link)?.path ?? null;
    const result = await createNotificationAction({ title, body, linkPath: path, audience });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error ?? "Erreur");
      return;
    }
    setTitle("");
    setBody("");
    setLink("none");
    setAudience("ALL");
    toast.success("Notification publiée");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteNotificationAction(id);
    setDeletingId(null);
    if (!result.success) {
      toast.error(result.error ?? "Erreur");
      return;
    }
    toast.success("Notification supprimée");
    router.refresh();
  }

  function handleLinkChange(value: string) {
    setLink(value as LinkValue); // values come from LINK_OPTIONS only
  }

  function handleAudienceChange(value: string) {
    setAudience(value === "PAYING" ? "PAYING" : "ALL");
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Nouvelle notification</CardTitle>
          <CardDescription>
            Visible par les utilisateurs dont le compte existait déjà au moment de la publication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notif-title">Titre</Label>
              <Input id="notif-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-body">Message</Label>
              <Textarea id="notif-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={2000} disabled={isSaving} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notif-link">Bouton « Ouvrir » vers</Label>
                <Select value={link} onValueChange={handleLinkChange} disabled={isSaving}>
                  <SelectTrigger id="notif-link"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LINK_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notif-audience">Destinataires</Label>
                <Select value={audience} onValueChange={handleAudienceChange} disabled={isSaving}>
                  <SelectTrigger id="notif-audience"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous les utilisateurs</SelectItem>
                    <SelectItem value="PAYING">Comptes payants uniquement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isSaving || !title.trim() || !body.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Publier
            </Button>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="published-heading" className="space-y-3">
        <h3 id="published-heading" className="text-lg font-medium">Publiées</h3>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune notification publiée.</p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li key={n.id} className="rounded-lg border p-4 space-y-1">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium">{n.title}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(n.id)}
                    disabled={deletingId === n.id}
                    aria-label={`Supprimer la notification « ${n.title} »`}
                  >
                    {deletingId === n.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(n.createdAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                  {" · "}{n.audience === "PAYING" ? "Comptes payants" : "Tous"}
                  {" · "}Lien : {linkLabel(n.linkPath)}
                  {" · "}Lue par {n.readCount} utilisateur{n.readCount > 1 ? "s" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

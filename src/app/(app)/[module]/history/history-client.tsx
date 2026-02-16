"use client";

import { CheckCircle2, AlertCircle, Mail, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/utils";
import type { EmailEvent } from "./actions";

interface HistoryClientProps {
  events: EmailEvent[];
  moduleType: "APA" | "ASH";
}

const EMAIL_TYPE_LABELS: Record<EmailEvent["emailType"], string> = {
  STANDARD: "Standard",
  DERNIER: "Dernier email",
};

const EMAIL_REASON_LABELS: Record<string, string> = {
  DECES: "Deces",
  DESSAISISSEMENT: "Dessaisissement",
};

export function HistoryClient({ events, moduleType }: HistoryClientProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const sentCount = sorted.filter((e) => e.status === "SENT").length;
  const failedCount = sorted.filter((e) => e.status === "FAILED").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          Historique {moduleType}
        </h2>
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>
            {sorted.length} envoi{sorted.length > 1 ? "s" : ""}
          </span>
          <span className="text-green-600">
            {sentCount} envoye{sentCount > 1 ? "s" : ""}
          </span>
          {failedCount > 0 && (
            <span className="text-red-600">
              {failedCount} echoue{failedCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {sorted.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail
                className="mx-auto h-12 w-12 mb-4 opacity-50"
                aria-hidden="true"
              />
              <p>Aucun envoi pour ce module</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-4xl">
              {/* Table header */}
              <div className="hidden md:grid md:grid-cols-[1fr_140px_160px_100px_1fr] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
                <span>Dossier</span>
                <span>Date</span>
                <span>Type</span>
                <span>Statut</span>
                <span>Objet</span>
              </div>

              {sorted.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function EventRow({ event }: { event: EmailEvent }) {
  const isSent = event.status === "SENT";
  const isDernier = event.emailType === "DERNIER";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_160px_100px_1fr] gap-2 md:gap-3 items-center px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      {/* Dossier name */}
      <div className="font-medium truncate text-sm">
        {event.dossierName || (
          <span className="text-muted-foreground italic">Sans dossier</span>
        )}
      </div>

      {/* Date */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {formatRelativeTime(new Date(event.createdAt))}
        </span>
      </div>

      {/* Email type */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant={isDernier ? "destructive" : "secondary"}>
          {EMAIL_TYPE_LABELS[event.emailType]}
        </Badge>
        {isDernier && event.emailReason && (
          <Badge variant="outline" className="text-xs">
            {EMAIL_REASON_LABELS[event.emailReason]}
          </Badge>
        )}
      </div>

      {/* Status */}
      <div>
        <Badge
          variant={isSent ? "active" : "destructive"}
          className="flex items-center gap-1 w-fit"
        >
          {isSent ? (
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
          )}
          {isSent ? "Envoye" : "Echec"}
        </Badge>
      </div>

      {/* Subject */}
      <div className="text-sm text-muted-foreground truncate">
        {event.subject}
      </div>
    </div>
  );
}

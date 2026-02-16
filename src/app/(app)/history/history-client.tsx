"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { resendEmail, type EmailBatchGroup, type EmailEvent } from "./actions";

interface HistoryPageClientProps {
  initialHistory: EmailBatchGroup[];
}

export function HistoryPageClient({ initialHistory }: HistoryPageClientProps) {
  const router = useRouter();
  const [history, setHistory] = useState(initialHistory);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [resendingId, setResendingId] = useState<string | null>(null);

  const toggleBatch = (batchId: string | null) => {
    const key = batchId || "null";
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleResend = async (eventId: string) => {
    setResendingId(eventId);
    try {
      const result = await resendEmail(eventId);
      if (result.success) {
        toast.success("Email renvoyé avec succès");
        router.refresh();
      } else {
        toast.error(result.error || "Échec du renvoi");
      }
    } catch {
      toast.error("Erreur lors du renvoi");
    } finally {
      setResendingId(null);
    }
  };

  const totalEvents = history.reduce((acc, batch) => acc + batch.events.length, 0);
  const sentCount = history.reduce(
    (acc, batch) => acc + batch.events.filter((e) => e.status === "SENT").length,
    0
  );
  const failedCount = history.reduce(
    (acc, batch) => acc + batch.events.filter((e) => e.status === "FAILED").length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          Historique d&apos;envoi
        </h2>
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>{totalEvents} email{totalEvents > 1 ? "s" : ""}</span>
          <span className="text-green-600">{sentCount} envoyé{sentCount > 1 ? "s" : ""}</span>
          {failedCount > 0 && (
            <span className="text-red-600">{failedCount} échoué{failedCount > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
            <p>Aucun email envoyé pour le moment</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl">
            {history.map((batch) => (
              <BatchGroup
                key={batch.batchId || "single"}
                batch={batch}
                isExpanded={expandedBatches.has(batch.batchId || "null")}
                onToggle={() => toggleBatch(batch.batchId)}
                onResend={handleResend}
                resendingId={resendingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Collapsible component
function CollapsibleRoot({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      {children}
    </Collapsible>
  );
}

interface BatchGroupProps {
  batch: EmailBatchGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onResend: (eventId: string) => void;
  resendingId: string | null;
}

function BatchGroup({
  batch,
  isExpanded,
  onToggle,
  onResend,
  resendingId,
}: BatchGroupProps) {
  const isSingleEvent = batch.events.length === 1;
  const firstEvent = batch.events[0];

  if (isSingleEvent) {
    return (
      <EmailEventCard
        event={firstEvent}
        onResend={onResend}
        isResending={resendingId === firstEvent.id}
      />
    );
  }

  return (
    <CollapsibleRoot open={isExpanded} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">
                  Lot de {batch.events.length} emails
                </CardTitle>
                <Badge variant="secondary">
                  {format(new Date(batch.createdAt), "d MMM yyyy HH:mm", {
                    locale: fr,
                  })}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" aria-label={isExpanded ? "Réduire" : "Développer"}>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {batch.events.map((event) => (
              <EmailEventCard
                key={event.id}
                event={event}
                onResend={onResend}
                isResending={resendingId === event.id}
                compact
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </CollapsibleRoot>
  );
}

interface EmailEventCardProps {
  event: EmailEvent;
  onResend: (eventId: string) => void;
  isResending: boolean;
  compact?: boolean;
}

function EmailEventCard({
  event,
  onResend,
  isResending,
  compact = false,
}: EmailEventCardProps) {
  const Wrapper = compact ? "div" : Card;
  const Content = compact ? "div" : CardContent;

  return (
    <Wrapper className={compact ? "p-3 rounded-lg border bg-muted/30" : ""}>
      <Content className={compact ? "" : "p-4"}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant={event.status === "SENT" ? "active" : "destructive"}
                className="flex items-center gap-1"
              >
                {event.status === "SENT" ? (
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                )}
                {event.status === "SENT" ? "Envoyé" : "Échec"}
              </Badge>
              {!compact && (
                <span className="text-sm text-muted-foreground">
                  {format(new Date(event.createdAt), "d MMM yyyy 'à' HH:mm", {
                    locale: fr,
                  })}
                </span>
              )}
            </div>

            <h4 className="font-medium truncate">{event.subject}</h4>

            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
              <p className="truncate">
                <span className="text-muted-foreground/70">À :</span>{" "}
                {event.recipients.join(", ")}
              </p>
              {event.dossierName && (
                <p className="flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" aria-hidden="true" />
                  {event.dossierName}
                </p>
              )}
            </div>

            {event.status === "FAILED" && event.errorMessage && (
              <p className="text-sm text-destructive mt-2">
                Erreur : {event.errorMessage}
              </p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onResend(event.id)}
            disabled={isResending}
            aria-label="Renvoyer cet email"
          >
            <RotateCcw
              className={`mr-1 h-3 w-3 ${isResending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Renvoyer
          </Button>
        </div>
      </Content>
    </Wrapper>
  );
}

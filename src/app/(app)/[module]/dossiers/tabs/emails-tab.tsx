"use client";

import { useState, useEffect } from "react";
import { Mail, Send, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/utils";
import { SendEmailDialog } from "../../history/send-email-dialog";
import { getDossierEmails, type EmailEvent } from "../../history/actions";

interface EmailsTabProps {
  dossierId: string;
  moduleType: "APA" | "ASH";
}

export function EmailsTab({ dossierId, moduleType }: EmailsTabProps) {
  const [emails, setEmails] = useState<EmailEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [resendEvent, setResendEvent] = useState<EmailEvent | null>(null);

  useEffect(() => {
    async function loadEmails() {
      try {
        const data = await getDossierEmails(dossierId);
        setEmails(data);
      } catch {
        // Silently fail
      } finally {
        setIsLoading(false);
      }
    }
    loadEmails();
  }, [dossierId]);

  const handleResend = (event: EmailEvent) => {
    setResendEvent(event);
    setIsSendOpen(true);
  };

  const handleSendComplete = async () => {
    const data = await getDossierEmails(dossierId);
    setEmails(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">
          Historique des emails ({emails.length})
        </h4>
        <Button
          size="sm"
          onClick={() => {
            setResendEvent(null);
            setIsSendOpen(true);
          }}
        >
          <Send className="mr-2 h-4 w-4" aria-hidden="true" />
          Envoyer un email
        </Button>
      </div>

      {emails.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun email envoyé pour ce dossier
        </p>
      ) : (
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {emails.map((email) => (
              <div
                key={email.id}
                className="p-3 rounded-lg border bg-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium truncate max-w-[200px]">
                      {email.subject}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {email.emailType === "DERNIER" && (
                      <Badge variant="outline" className="text-xs">
                        {email.emailReason === "DECES" ? "Décès" : "Dessaisissement"}
                      </Badge>
                    )}
                    <Badge
                      variant={email.status === "SENT" ? "active" : "destructive"}
                      className="flex items-center gap-1"
                    >
                      {email.status === "SENT" ? (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      )}
                      {email.status === "SENT" ? "Envoyé" : "Échec"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  À : {email.recipients.join(", ")}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatRelativeTime(new Date(email.createdAt))}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleResend(email)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
                    Renvoyer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <SendEmailDialog
        open={isSendOpen}
        onOpenChange={setIsSendOpen}
        dossierId={dossierId}
        moduleType={moduleType}
        resendEvent={resendEvent}
        onComplete={handleSendComplete}
      />
    </div>
  );
}

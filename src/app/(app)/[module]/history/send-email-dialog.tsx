"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendEmailSchema, type SendEmailFormData } from "@/lib/validations";
import { sendEmailAction, type EmailEvent } from "./actions";
import { getTemplates, type TemplateData } from "../../settings/actions";
import { getDocuments } from "../dossiers/document-actions";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dossierId?: string;
  moduleType: "APA" | "ASH";
  resendEvent?: EmailEvent | null;
  onComplete?: () => void;
}

type Document = {
  id: string;
  filename: string;
  size: number;
  createdAt: Date;
};

export function SendEmailDialog({
  open,
  onOpenChange,
  dossierId,
  moduleType,
  resendEvent,
  onComplete,
}: SendEmailDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SendEmailFormData>({
    resolver: zodResolver(sendEmailSchema),
    defaultValues: {
      dossierId: dossierId,
      moduleType: moduleType,
      emailType: "STANDARD",
      recipients: [],
      ccRecipients: [],
      bccRecipients: [],
      subject: "",
      body: "",
      attachmentIds: [],
    },
  });

  const recipientsStr = watch("recipients");

  useEffect(() => {
    async function loadData() {
      try {
        const [templatesData, docsData] = await Promise.all([
          getTemplates(),
          dossierId ? getDocuments(dossierId) : Promise.resolve([]),
        ]);
        // Filter templates by module type
        const filtered = templatesData.filter(
          (t) => t.category === moduleType || t.category === "CUSTOM"
        );
        setTemplates(filtered);
        setDocuments(docsData);

        if (docsData.length > 0) {
          setSelectedDocIds([docsData[0].id]);
        }
      } catch {
        // Silently fail
      }
    }

    if (open) {
      loadData();
    }
  }, [open, dossierId, moduleType]);

  useEffect(() => {
    if (resendEvent && open) {
      reset({
        dossierId: resendEvent.dossierId || undefined,
        moduleType: moduleType,
        emailType: "STANDARD",
        recipients: resendEvent.recipients,
        ccRecipients: resendEvent.ccRecipients,
        bccRecipients: resendEvent.bccRecipients,
        subject: resendEvent.subject,
        body: resendEvent.body,
        attachmentIds: [],
      });
    } else if (!open) {
      reset({
        dossierId: dossierId,
        moduleType: moduleType,
        emailType: "STANDARD",
        recipients: [],
        ccRecipients: [],
        bccRecipients: [],
        subject: "",
        body: "",
        attachmentIds: [],
      });
      setSelectedDocIds([]);
    }
  }, [resendEvent, open, dossierId, moduleType, reset]);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setValue("subject", template.subject);
      setValue("body", template.body);
    }
  };

  const handleDocToggle = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  async function onSubmit(data: SendEmailFormData) {
    setIsLoading(true);
    try {
      const result = await sendEmailAction({
        ...data,
        dossierId,
        moduleType,
        attachmentIds: selectedDocIds,
      });

      if (result.success) {
        toast.success("Email envoyé avec succès");
        onOpenChange(false);
        onComplete?.();
      } else {
        toast.error(result.error || "Échec de l'envoi");
      }
    } catch {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setIsLoading(false);
    }
  }

  const handleRecipientsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const emails = value
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
    setValue("recipients", emails);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {resendEvent ? "Renvoyer l'email" : `Envoyer un email ${moduleType}`}
          </DialogTitle>
          <DialogDescription>
            {resendEvent
              ? "Modifiez et renvoyez cet email"
              : `Composez et envoyez un email via le module ${moduleType}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {templates.length > 0 && !resendEvent && (
            <div className="space-y-2">
              <Label htmlFor="template">Modèle {moduleType} (optionnel)</Label>
              <Select onValueChange={handleTemplateSelect}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Sélectionner un modèle" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="recipients">
              Destinataires <span className="text-destructive">*</span>
            </Label>
            <Input
              id="recipients"
              placeholder="email1@example.com, email2@example.com"
              disabled={isLoading}
              defaultValue={recipientsStr?.join(", ") || ""}
              onChange={handleRecipientsChange}
              aria-describedby={errors.recipients ? "recipients-error" : undefined}
            />
            {errors.recipients && (
              <p id="recipients-error" className="text-sm text-destructive">
                {errors.recipients.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Séparez les adresses par des virgules
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">
              Objet <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subject"
              placeholder="Objet de l'email"
              disabled={isLoading}
              aria-describedby={errors.subject ? "subject-error" : undefined}
              {...register("subject")}
            />
            {errors.subject && (
              <p id="subject-error" className="text-sm text-destructive">
                {errors.subject.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">
              Message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="body"
              placeholder="Corps du message..."
              rows={6}
              disabled={isLoading}
              aria-describedby={errors.body ? "body-error" : undefined}
              {...register("body")}
            />
            {errors.body && (
              <p id="body-error" className="text-sm text-destructive">
                {errors.body.message}
              </p>
            )}
          </div>

          {documents.length > 0 && (
            <div className="space-y-2">
              <Label>Pièces jointes</Label>
              <ScrollArea className="h-32 border rounded-md p-2">
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`doc-${doc.id}`}
                        checked={selectedDocIds.includes(doc.id)}
                        onCheckedChange={() => handleDocToggle(doc.id)}
                        disabled={isLoading}
                      />
                      <Label
                        htmlFor={`doc-${doc.id}`}
                        className="text-sm font-normal cursor-pointer truncate"
                      >
                        {doc.filename}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Envoyer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

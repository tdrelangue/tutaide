"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Send, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { broadcastEmailSchema, type BroadcastEmailFormData } from "@/lib/validations";
import { sendBroadcastEmail } from "../actions";

interface BroadcastFormProps {
  activeCount: number;
  hasSmtp: boolean;
}

export function BroadcastForm({ activeCount, hasSmtp }: BroadcastFormProps) {
  const [isSending, setIsSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    reset,
    formState: { errors },
  } = useForm<BroadcastEmailFormData>({
    resolver: zodResolver(broadcastEmailSchema),
  });

  async function openConfirm() {
    const isValid = await trigger();
    if (isValid) setConfirmOpen(true);
  }

  async function onConfirmSend() {
    setConfirmOpen(false);
    setIsSending(true);
    try {
      const result = await sendBroadcastEmail(getValues());
      if (result.success) {
        toast.success(`Email envoyé à ${result.sentCount} utilisateur${result.sentCount && result.sentCount > 1 ? "s" : ""}.`);
        reset();
      } else {
        toast.error(result.error || "Erreur lors de l'envoi");
      }
    } catch {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setIsSending(false);
    }
  }

  if (!hasSmtp) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 pt-6">
          <TriangleAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Vous devez d&apos;abord configurer votre SMTP personnel dans{" "}
            <strong>Paramètres</strong> avant de pouvoir envoyer un email à tous les
            utilisateurs.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(openConfirm)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">
              Objet <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subject"
              disabled={isSending}
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
              rows={10}
              disabled={isSending}
              aria-describedby={errors.body ? "body-error" : undefined}
              {...register("body")}
            />
            {errors.body && (
              <p id="body-error" className="text-sm text-destructive">
                {errors.body.message}
              </p>
            )}
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button type="submit" disabled={isSending}>
                {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                Envoyer à tous les utilisateurs
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer l&apos;envoi</AlertDialogTitle>
                <AlertDialogDescription>
                  Cet email sera envoyé à <strong>{activeCount} utilisateur{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}</strong>.
                  Cette action ne peut pas être annulée une fois l&apos;envoi lancé.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={onConfirmSend}>
                  Envoyer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </form>
      </CardContent>
    </Card>
  );
}

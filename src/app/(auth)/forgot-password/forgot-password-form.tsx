"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "@/lib/validations";
import { requestPasswordResetAction, resetPasswordAction } from "../actions";

type EmailStepData = { email: string };
type ResetStepData = {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
};

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emailForm = useForm<EmailStepData>({
    resolver: zodResolver(requestPasswordResetSchema),
  });

  const resetForm = useForm<ResetStepData>({
    resolver: zodResolver(
      resetPasswordSchema.extend({
        confirmPassword: resetPasswordSchema.shape.newPassword,
      })
    ),
  });

  async function onRequestCode(data: EmailStepData) {
    setIsLoading(true);
    try {
      const result = await requestPasswordResetAction(data.email);
      if (result.success) {
        setEmail(data.email);
        resetForm.setValue("email", data.email);
        toast.success("Si ce compte existe, un code a été envoyé par email.");
        setStep("reset");
      } else {
        toast.error(result.error || "Une erreur est survenue");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }

  async function onResetPassword(data: ResetStepData) {
    if (data.newPassword !== data.confirmPassword) {
      resetForm.setError("confirmPassword", {
        message: "Les mots de passe ne correspondent pas",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await resetPasswordAction({
        email: data.email,
        code: data.code,
        newPassword: data.newPassword,
      });
      if (result.success) {
        toast.success("Mot de passe réinitialisé — vous pouvez vous connecter.");
        router.push("/login");
      } else {
        toast.error(result.error || "Code invalide ou expiré");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }

  if (step === "email") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mot de passe oublié</CardTitle>
          <CardDescription>
            Entrez votre email pour recevoir un code de réinitialisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={emailForm.handleSubmit(onRequestCode)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.fr"
                autoComplete="email"
                autoFocus
                disabled={isLoading}
                aria-describedby={emailForm.formState.errors.email ? "email-error" : undefined}
                aria-invalid={emailForm.formState.errors.email ? "true" : "false"}
                {...emailForm.register("email")}
              />
              {emailForm.formState.errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {emailForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Envoyer le code
            </Button>

            <Button variant="ghost" className="w-full" asChild disabled={isLoading}>
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Retour à la connexion
              </Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau mot de passe</CardTitle>
        <CardDescription>
          Entrez le code reçu par email à {email} et votre nouveau mot de passe
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="space-y-4">
          <input type="hidden" {...resetForm.register("email")} />

          <div className="space-y-2">
            <Label htmlFor="code">Code de vérification</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              autoComplete="one-time-code"
              autoFocus
              disabled={isLoading}
              aria-describedby={resetForm.formState.errors.code ? "code-error" : undefined}
              aria-invalid={resetForm.formState.errors.code ? "true" : "false"}
              {...resetForm.register("code")}
            />
            {resetForm.formState.errors.code && (
              <p id="code-error" className="text-sm text-destructive">
                {resetForm.formState.errors.code.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Nouveau mot de passe</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                disabled={isLoading}
                className="pr-10"
                aria-describedby={
                  resetForm.formState.errors.newPassword ? "newPassword-error" : undefined
                }
                aria-invalid={resetForm.formState.errors.newPassword ? "true" : "false"}
                {...resetForm.register("newPassword")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </Button>
            </div>
            {resetForm.formState.errors.newPassword && (
              <p id="newPassword-error" className="text-sm text-destructive">
                {resetForm.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              disabled={isLoading}
              aria-describedby={
                resetForm.formState.errors.confirmPassword ? "confirmPassword-error" : undefined
              }
              aria-invalid={resetForm.formState.errors.confirmPassword ? "true" : "false"}
              {...resetForm.register("confirmPassword")}
            />
            {resetForm.formState.errors.confirmPassword && (
              <p id="confirmPassword-error" className="text-sm text-destructive">
                {resetForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Réinitialiser le mot de passe
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={isLoading}
            onClick={() => setStep("email")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Renvoyer un code
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

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
import { signupSchema, type SignupFormData } from "@/lib/validations";
import { signupAction } from "../actions";

type FieldName = keyof SignupFormData;

const FIELDS: {
  name: FieldName;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
}[] = [
  { name: "name", label: "Nom et prénom", type: "text", autoComplete: "name" },
  { name: "email", label: "Email professionnel", type: "email", autoComplete: "email" },
  { name: "password", label: "Mot de passe", type: "password", autoComplete: "new-password", hint: "8 caractères minimum" },
  { name: "confirmPassword", label: "Confirmer le mot de passe", type: "password", autoComplete: "new-password" },
];

export function SignupForm({ priceLabel }: { priceLabel: string | null }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(data: SignupFormData) {
    setIsLoading(true);
    setFormError(null);
    try {
      const result = await signupAction(data);
      if (!result.success) {
        setFormError(result.error ?? "Une erreur est survenue");
        return;
      }
      const login = await signIn("credentials", {
        email: data.email.toLowerCase(),
        password: data.password,
        redirect: false,
      });
      if (login?.error) {
        router.push("/login");
        return;
      }
      router.push("/abonnement");
      router.refresh();
    } catch {
      setFormError("Une erreur est survenue. Réessayez.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium text-muted-foreground">Étape 1 sur 2 — votre compte</p>
        <CardTitle>Créer un compte</CardTitle>
        <CardDescription>
          À l&apos;étape suivante, vous réglerez l&apos;abonnement annuel
          {priceLabel ? ` (${priceLabel})` : ""} par carte, sur la page sécurisée de Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {FIELDS.map((field, index) => {
            const error = errors[field.name]?.message;
            const describedBy = [
              field.hint ? `${field.name}-hint` : null,
              error ? `${field.name}-error` : null,
            ].filter(Boolean).join(" ") || undefined;
            return (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input
                  id={field.name}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  autoFocus={index === 0}
                  disabled={isLoading}
                  aria-describedby={describedBy}
                  aria-invalid={error ? "true" : "false"}
                  {...register(field.name)}
                />
                {field.hint && (
                  <p id={`${field.name}-hint`} className="text-sm text-muted-foreground">{field.hint}</p>
                )}
                {error && (
                  <p id={`${field.name}-error`} className="text-sm text-destructive">{error}</p>
                )}
              </div>
            );
          })}

          {formError && (
            <p role="alert" className="text-sm text-destructive">{formError}</p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Continuer vers le paiement
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

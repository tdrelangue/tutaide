"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { systemConfigSchema, type SystemConfigFormData } from "@/lib/validations";
import {
  saveSystemConfig,
  testSystemSmtpConnection,
  type SystemConfigData,
} from "../actions";

interface SystemConfigFormProps {
  initialConfig: SystemConfigData;
}

export function SystemConfigForm({ initialConfig }: SystemConfigFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SystemConfigFormData>({
    resolver: zodResolver(systemConfigSchema),
    defaultValues: {
      smtpHost: initialConfig?.smtpHost || "",
      smtpPort: initialConfig?.smtpPort || 587,
      secure: initialConfig?.secure ?? true,
      username: initialConfig?.username || "",
      password: "",
      fromName: initialConfig?.fromName || "",
      fromEmail: initialConfig?.fromEmail || "",
    },
  });

  const secure = watch("secure");

  async function onTest() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testSystemSmtpConnection(watch());
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Erreur inattendue lors du test." });
    } finally {
      setIsTesting(false);
    }
  }

  async function onSubmit(data: SystemConfigFormData) {
    setIsLoading(true);
    try {
      const result = await saveSystemConfig(data);
      if (result.success) {
        toast.success("Configuration enregistrée");
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de l'enregistrement");
      }
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration SMTP</CardTitle>
        <CardDescription>
          {initialConfig ? (
            <span className="block text-green-600">Configuration existante détectée</span>
          ) : (
            "Aucune configuration système enregistrée — les emails de récupération ne peuvent pas être envoyés."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtpHost">
                Serveur SMTP <span className="text-destructive">*</span>
              </Label>
              <Input
                id="smtpHost"
                placeholder="smtp.example.com"
                disabled={isLoading}
                aria-describedby={errors.smtpHost ? "smtpHost-error" : undefined}
                {...register("smtpHost")}
              />
              {errors.smtpHost && (
                <p id="smtpHost-error" className="text-sm text-destructive">
                  {errors.smtpHost.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtpPort">
                Port <span className="text-destructive">*</span>
              </Label>
              <Input
                id="smtpPort"
                type="number"
                placeholder="587"
                disabled={isLoading}
                aria-describedby={errors.smtpPort ? "smtpPort-error" : undefined}
                {...register("smtpPort", { valueAsNumber: true })}
              />
              {errors.smtpPort && (
                <p id="smtpPort-error" className="text-sm text-destructive">
                  {errors.smtpPort.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="secure"
              checked={secure}
              onCheckedChange={(checked) => setValue("secure", checked as boolean)}
              disabled={isLoading}
            />
            <Label htmlFor="secure" className="cursor-pointer">
              Utiliser TLS/SSL (recommandé)
            </Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="username">
                Nom d&apos;utilisateur <span className="text-destructive">*</span>
              </Label>
              <Input
                id="username"
                placeholder="votre@email.com"
                disabled={isLoading}
                aria-describedby={errors.username ? "username-error" : undefined}
                {...register("username")}
              />
              {errors.username && (
                <p id="username-error" className="text-sm text-destructive">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Mot de passe <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={initialConfig ? "••••••••" : "Mot de passe"}
                  disabled={isLoading}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  {...register("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fromName">
                Nom d&apos;expéditeur <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fromName"
                placeholder="Tutellia"
                disabled={isLoading}
                aria-describedby={errors.fromName ? "fromName-error" : undefined}
                {...register("fromName")}
              />
              {errors.fromName && (
                <p id="fromName-error" className="text-sm text-destructive">
                  {errors.fromName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromEmail">
                Email d&apos;expéditeur <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fromEmail"
                type="email"
                placeholder="noreply@example.com"
                disabled={isLoading}
                aria-describedby={errors.fromEmail ? "fromEmail-error" : undefined}
                {...register("fromEmail")}
              />
              {errors.fromEmail && (
                <p id="fromEmail-error" className="text-sm text-destructive">
                  {errors.fromEmail.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isLoading || isTesting}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isTesting}
              onClick={onTest}
            >
              {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Tester la connexion
            </Button>
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                testResult.success
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
              role="status"
            >
              {testResult.success ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {testResult.message}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

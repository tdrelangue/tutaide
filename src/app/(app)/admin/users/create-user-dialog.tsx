"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BillingRequiredField, eurosToCents } from "./billing-required-field";
import { createUser } from "../actions";

const schema = z.object({
  email: z.string().email("Email invalide"),
  name: z.string().min(2, "Au moins 2 caracteres").optional().or(z.literal("")),
  password: z.string().min(8, "Au moins 8 caracteres"),
  role: z.enum(["USER", "ADMIN"]),
  billingRequired: z.boolean(),
  billingPlan: z.enum(["individual", "entreprise"]),
  customAmount: z.string(),
  billingStartsAt: z.string(),
}).refine((d) => !d.billingRequired || d.billingPlan === "individual" || eurosToCents(d.customAmount) !== null, {
  message: "Indiquez un prix annuel valide (ex. 1200)",
  path: ["customAmount"],
});

type FormData = z.infer<typeof schema>;

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onComplete,
}: CreateUserDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "USER",
      billingRequired: false,
      billingPlan: "individual",
      customAmount: "",
      billingStartsAt: "",
    },
  });

  const role = watch("role");
  const billingRequired = watch("billingRequired");
  const billingPlan = watch("billingPlan");
  const customAmount = watch("customAmount");
  const billingStartsAt = watch("billingStartsAt");

  async function onSubmit(data: FormData) {
    setIsSaving(true);
    try {
      const result = await createUser({
        email: data.email,
        name: data.name || undefined,
        password: data.password,
        role: data.role,
        billingRequired: data.billingRequired,
        billingCustomAmountCents: data.billingPlan === "entreprise" ? eurosToCents(data.customAmount) : null,
        billingStartsAt: data.billingRequired && data.billingStartsAt ? data.billingStartsAt : null,
      });
      if (result.success) {
        toast.success("Utilisateur cree");
        reset();
        onOpenChange(false);
        onComplete();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Creez un nouveau compte utilisateur
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              placeholder="utilisateur@exemple.fr"
              disabled={isSaving}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-name">Nom (optionnel)</Label>
            <Input
              id="create-name"
              placeholder="Jean Dupont"
              disabled={isSaving}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-password">Mot de passe</Label>
            <Input
              id="create-password"
              type="password"
              placeholder="Minimum 8 caracteres"
              disabled={isSaving}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setValue("role", v as "USER" | "ADMIN")}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">Utilisateur</SelectItem>
                <SelectItem value="ADMIN">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <BillingRequiredField
            id="create-billing"
            checked={billingRequired}
            onCheckedChange={(v) => setValue("billingRequired", v)}
            plan={billingPlan}
            onPlanChange={(v) => setValue("billingPlan", v)}
            amount={customAmount}
            onAmountChange={(v) => setValue("customAmount", v)}
            amountError={errors.customAmount?.message}
            startDate={billingStartsAt}
            onStartDateChange={(v) => setValue("billingStartsAt", v)}
            disabled={isSaving}
            warnOnEnable={false}
            hasExistingPrice={false}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Creer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

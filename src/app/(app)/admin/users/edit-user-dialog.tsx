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
import { updateUser } from "../actions";
import type { AdminUserData } from "../actions";

const schema = z.object({
  email: z.string().email("Email invalide"),
  name: z.string().optional().or(z.literal("")),
  password: z
    .string()
    .min(8, "Au moins 8 caracteres")
    .optional()
    .or(z.literal("")),
  role: z.enum(["USER", "ADMIN"]),
});

type FormData = z.infer<typeof schema>;

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserData;
  onComplete: () => void;
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  onComplete,
}: EditUserDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: user.email,
      name: user.name ?? "",
      password: "",
      role: user.role,
    },
  });

  const role = watch("role");

  async function onSubmit(data: FormData) {
    setIsSaving(true);
    try {
      const updateData: {
        email?: string;
        name?: string | null;
        password?: string;
        role?: "USER" | "ADMIN";
      } = {};

      if (data.email !== user.email) updateData.email = data.email;
      if (data.name !== (user.name ?? "")) {
        updateData.name = data.name || null;
      }
      if (data.password && data.password.length > 0) {
        updateData.password = data.password;
      }
      if (data.role !== user.role) updateData.role = data.role;

      if (Object.keys(updateData).length === 0) {
        toast.info("Aucune modification");
        onOpenChange(false);
        return;
      }

      const result = await updateUser(user.id, updateData);
      if (result.success) {
        toast.success("Utilisateur mis a jour");
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
          <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
          <DialogDescription>
            {user.name || user.email}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              disabled={isSaving}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Nom</Label>
            <Input
              id="edit-name"
              disabled={isSaving}
              {...register("name")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-password">
              Nouveau mot de passe{" "}
              <span className="text-muted-foreground font-normal">
                (laisser vide pour ne pas changer)
              </span>
            </Label>
            <Input
              id="edit-password"
              type="password"
              placeholder="Minimum 8 caracteres"
              disabled={isSaving}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
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
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

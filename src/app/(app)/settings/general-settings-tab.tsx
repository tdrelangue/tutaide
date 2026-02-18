"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { updatePassword, updateSignature } from "./actions";

interface GeneralSettingsTabProps {
  initialSignature: string;
}

export function GeneralSettingsTab({
  initialSignature,
}: GeneralSettingsTabProps) {
  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Signature state
  const [signature, setSignature] = useState(initialSignature);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [signatureMessage, setSignatureMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "Les mots de passe ne correspondent pas",
      });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "Le nouveau mot de passe doit contenir au moins 8 caracteres",
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await updatePassword({
        currentPassword,
        newPassword,
      });

      if (result.success) {
        setPasswordMessage({ type: "success", text: "Mot de passe mis a jour" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMessage({
          type: "error",
          text: result.error || "Erreur",
        });
      }
    } catch {
      setPasswordMessage({ type: "error", text: "Erreur inattendue" });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSignatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignatureMessage(null);
    setSignatureLoading(true);

    try {
      const result = await updateSignature(signature);
      if (result.success) {
        setSignatureMessage({ type: "success", text: "Signature mise a jour" });
      } else {
        setSignatureMessage({
          type: "error",
          text: result.error || "Erreur",
        });
      }
    } catch {
      setSignatureMessage({ type: "error", text: "Erreur inattendue" });
    } finally {
      setSignatureLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Password Change */}
      <Card>
        <CardHeader>
          <CardTitle>Changer le mot de passe</CardTitle>
          <CardDescription>
            Mettez a jour votre mot de passe de connexion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Mot de passe actuel</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {passwordMessage && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  passwordMessage.type === "success"
                    ? "text-green-600"
                    : "text-destructive"
                }`}
              >
                {passwordMessage.type === "success" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {passwordMessage.text}
              </div>
            )}

            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Mettre a jour
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email Signature */}
      <Card>
        <CardHeader>
          <CardTitle>Signature email</CardTitle>
          <CardDescription>
            Cette signature sera ajoutee automatiquement a vos emails. Utilisez
            le placeholder {"{{signature}}"} dans vos modeles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignatureSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signature">Signature</Label>
              <Textarea
                id="signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                rows={6}
                placeholder="Cordialement,&#10;Votre nom&#10;Votre titre"
              />
            </div>

            {signatureMessage && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  signatureMessage.type === "success"
                    ? "text-green-600"
                    : "text-destructive"
                }`}
              >
                {signatureMessage.type === "success" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {signatureMessage.text}
              </div>
            )}

            <Button type="submit" disabled={signatureLoading}>
              {signatureLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Enregistrer la signature
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

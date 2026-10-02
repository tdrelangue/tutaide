"use server";

import { requestPasswordReset, resetPassword } from "@/lib/password-reset";
import { createSelfServeAccount } from "@/lib/accounts";
import { requestPasswordResetSchema, resetPasswordSchema, signupSchema } from "@/lib/validations";

export async function requestPasswordResetAction(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const validated = requestPasswordResetSchema.parse({ email });
    return await requestPasswordReset(validated.email);
  } catch {
    return { success: false, error: "Email invalide" };
  }
}

export async function resetPasswordAction(data: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const validated = resetPasswordSchema.parse(data);
    return await resetPassword(validated.email, validated.code, validated.newPassword);
  } catch {
    return { success: false, error: "Données invalides" };
  }
}

export async function signupAction(data: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = signupSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  try {
    return await createSelfServeAccount(parsed.data);
  } catch {
    return { success: false, error: "Impossible de créer le compte pour le moment. Réessayez." };
  }
}

import { hash } from "bcryptjs";
import { db } from "./db";
import { seedGlobalTemplates } from "./default-templates";

/** Self-service signup. Always creates a USER; payment is required next. */
export async function createSelfServeAccount(data: {
  email: string;
  name: string;
  password: string;
}): Promise<{ success: boolean; error?: string }> {
  const email = data.email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { success: false, error: "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez votre mot de passe." };
  }

  await db.user.create({
    data: {
      email,
      name: data.name,
      passwordHash: await hash(data.password, 12),
      role: "USER",
      billingRequired: true,
    },
  });
  await seedGlobalTemplates();

  return { success: true };
}

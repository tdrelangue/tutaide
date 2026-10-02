import { randomInt } from "crypto";
import { hash, compare } from "bcryptjs";
import { db } from "./db";
import { decrypt } from "./encryption";
import { sendEmail } from "./mailer-client";

const CODE_LENGTH = 6;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_VERIFY_ATTEMPTS = 5;

function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

async function getSystemSmtp(): Promise<{
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
} | null> {
  const config = await db.systemConfig.findUnique({ where: { id: "system" } });
  if (!config) return null;

  return {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.secure,
    username: config.username,
    password: decrypt(config.encryptedPassword),
    fromName: config.fromName,
    fromEmail: config.fromEmail,
  };
}

/**
 * Request a password reset code. Always returns a generic success response —
 * never reveals whether the email exists, to prevent account enumeration.
 */
export async function requestPasswordReset(email: string): Promise<{ success: true }> {
  const normalizedEmail = email.toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || user.archivedAt !== null) {
    return { success: true };
  }

  const recentToken = await db.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recentToken) {
    return { success: true };
  }

  const code = generateCode();
  const codeHash = await hash(code, 12);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.passwordResetToken.create({
    data: { userId: user.id, codeHash, expiresAt },
  });

  // Fire-and-forget: sending must not block the response, otherwise the
  // request's latency (SMTP round-trip) leaks whether the account exists.
  sendRecoveryEmail(user.email, code).catch((error) => {
    console.error("[password-reset] Failed to send recovery email:", error);
  });

  return { success: true };
}

async function sendRecoveryEmail(toEmail: string, code: string): Promise<void> {
  const smtp = await getSystemSmtp();
  if (!smtp) {
    console.error("[password-reset] SystemConfig SMTP not configured — cannot send recovery email");
    return;
  }

  const result = await sendEmail({
    smtp,
    recipients: [toEmail],
    subject: "Réinitialisation de votre mot de passe - Tutellia",
    body: `Bonjour,

Voici votre code de réinitialisation de mot de passe : ${code}

Ce code est valable 1 heure et ne peut être utilisé qu'une seule fois. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.

Cordialement,
Tutellia`,
  });

  if (!result.success) {
    console.error("[password-reset] SMTP send failed:", result.error);
  }
}

/** Verify and consume a reset code, then update the user's password. */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  const genericError = { success: false, error: "Code invalide ou expiré" };

  if (!user || user.archivedAt !== null) {
    return genericError;
  }

  const token = await db.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_VERIFY_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!token) {
    return genericError;
  }

  const isValid = await compare(code, token.codeHash);
  if (!isValid) {
    const updated = await db.passwordResetToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts >= MAX_VERIFY_ATTEMPTS) {
      await db.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
    }
    return genericError;
  }

  const newHash = await hash(newPassword, 12);

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
    db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { success: true };
}

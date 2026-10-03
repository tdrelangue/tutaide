/**
 * IMAP server for a mailbox, derived from its SMTP server when that is known,
 * else guessed from the email domain. Used to file sent emails and by the
 * admin "Dossiers mail" inspector.
 *
 * Deriving from SMTP fixes OVH: the old email-domain guess produced
 * imap.<your-domain>, while OVH serves IMAP on ssl0.ovh.net (MX Plan) or on
 * the same exN.mail.ovh.net host as SMTP (Hosted Exchange).
 */
export function imapHostFor(smtpHost: string | null | undefined, email: string): string {
  const smtp = (smtpHost ?? "").trim().toLowerCase();
  if (smtp === "ssl0.ovh.net" || /^ex\d+\.mail\.ovh\.(net|ca)$/.test(smtp) || smtp === "pro1.mail.ovh.net") return smtp;
  if (smtp === "smtp.gmail.com") return "imap.gmail.com";
  if (smtp === "smtp.office365.com" || smtp === "smtp-mail.outlook.com") return "outlook.office365.com";
  if (smtp.startsWith("smtp.ionos.")) return smtp.replace(/^smtp\./, "imap.");
  if (smtp === "smtp.orange.fr") return "imap.orange.fr";
  return guessFromEmail(email);
}

function guessFromEmail(email: string): string {
  const domain = email.split("@").pop()?.toLowerCase() ?? "";
  if (domain.includes("orange")) return "imap.orange.fr";
  if (domain.includes("gmail")) return "imap.gmail.com";
  if (["outlook", "hotmail", "live", "office365"].some((k) => domain.includes(k))) return "outlook.office365.com";
  if (domain.includes("yahoo")) return "imap.mail.yahoo.com";
  return `imap.${domain}`;
}

import { db } from "@/lib/db";

/**
 * Global templates shared across all users.
 * Stored once in the DB with isGlobal=true and userId=null.
 * Users cannot edit these — editing creates a personal copy.
 */
const GLOBAL_TEMPLATES = [
  {
    name: "Standard APA Trimestriel",
    subject: "Suivi APA - {{nom_protege}} - {{trimestre}}{{suffix}} trimestre {{annee}}",
    body: `Bonjour,

Veuillez trouver ci-joint le rapport trimestriel APA pour {{nom_protege}} ({{trimestre}}{{suffix}} trimestre {{annee}}).

Cordialement,

{{signature}}`,
    category: "APA" as const,
    isDefault: true,
    isGlobal: true,
  },
  {
    name: "Standard APA Mensuel",
    subject: "Suivi APA - {{nom_protege}} - {{mois}} {{annee}}",
    body: `Bonjour,

Veuillez trouver ci-joint le rapport mensuel APA pour {{nom_protege}} (pour le mois de {{mois}} {{annee}}).

Cordialement,

{{signature}}`,
    category: "APA" as const,
    isDefault: false,
    isGlobal: true,
  },
  {
    name: "Standard ASH Trimestriel",
    subject: "Suivi ASH - {{nom_protege}} - {{trimestre}}{{suffix}} trimestre {{annee}}",
    body: `Bonjour,

Veuillez trouver ci-joint le rapport trimestriel ASH pour {{nom_protege}} ({{trimestre}}{{suffix}} trimestre {{annee}}).

Cordialement,

{{signature}}`,
    category: "ASH" as const,
    isDefault: true,
    isGlobal: true,
  },
  {
    name: "Standard ASH Mensuel",
    subject: "Suivi ASH - {{nom_protege}} - {{mois}} {{annee}}",
    body: `Bonjour,

Veuillez trouver ci-joint le rapport mensuel ASH pour {{nom_protege}} (pour le mois de {{mois}} {{annee}}).

Cordialement,

{{signature}}`,
    category: "ASH" as const,
    isDefault: false,
    isGlobal: true,
  },
  {
    name: "Dernier email - Décès",
    subject: "Fin de mesure - Décès - {{nom_protege}}",
    body: `Madame, Monsieur,

J'ai le regret de vous informer du décès de {{nom_protege}}.

Pour cause de décès, je ne serai plus responsable de la gestion de ce dossier. La mesure de protection prend fin de plein droit.

Certains documents ou éléments peuvent être manquants car l'événement a eu lieu en cours de mois. Le suivi pour le mois en cours a été effectué dans la mesure du possible compte tenu des circonstances.

{{signature}}`,
    category: "DERNIER_DECES" as const,
    isDefault: true,
    isGlobal: true,
  },
  {
    name: "Dernier email - Dessaisissement",
    subject: "Fin de mesure - Dessaisissement - {{nom_protege}}",
    body: `Madame, Monsieur,

Je vous informe du dessaisissement concernant la mesure de protection de {{nom_protege}}.

Pour cause de dessaisissement, je ne serai plus responsable de la gestion de ce dossier.

Certains documents ou éléments peuvent être manquants car l'événement a eu lieu en cours de mois. Le suivi pour le mois en cours a été effectué dans la mesure du possible.

Le dossier sera transmis au nouveau mandataire désigné dans les meilleurs délais.

{{signature}}`,
    category: "DERNIER_DESSAISISSEMENT" as const,
    isDefault: true,
    isGlobal: true,
  },
];

/** Seed global templates once. Safe to call on every app start — no-ops if already seeded. */
export async function seedGlobalTemplates(): Promise<void> {
  const existingCount = await db.emailTemplate.count({
    where: { isGlobal: true },
  });
  if (existingCount > 0) return;

  await db.emailTemplate.createMany({
    data: GLOBAL_TEMPLATES.map((t) => ({
      ...t,
      userId: null,
    })),
  });
}

/** @deprecated Use seedGlobalTemplates() instead. Kept for backwards compatibility during migration. */
export async function seedDefaultTemplates(userId: string): Promise<void> {
  // No-op: templates are now global, not per-user.
  // Existing per-user templates are preserved but new users get global ones.
  void userId;
}

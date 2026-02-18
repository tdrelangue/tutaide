import { db } from "@/lib/db";

const DEFAULT_TEMPLATES = [
  {
    name: "Email standard APA",
    subject: "Suivi APA - {{nom_protege}} - {{mois}} {{annee}}",
    body: `Madame, Monsieur,

Veuillez trouver ci-joint les elements relatifs au suivi APA de {{nom_protege}} pour la periode en cours.

Ce courrier concerne le suivi mensuel dans le cadre de l'Allocation Personnalisee d'Autonomie.

Je reste a votre disposition pour tout complement d'information.

{{signature}}`,
    category: "APA" as const,
    isDefault: true,
  },
  {
    name: "Email standard ASH",
    subject: "Suivi ASH - {{nom_protege}} - {{mois}} {{annee}}",
    body: `Madame, Monsieur,

Veuillez trouver ci-joint les elements relatifs au suivi ASH de {{nom_protege}} pour la periode en cours.

Ce courrier concerne le suivi mensuel dans le cadre de l'Aide Sociale a l'Hebergement.

Je reste a votre disposition pour tout complement d'information.

{{signature}}`,
    category: "ASH" as const,
    isDefault: true,
  },
  {
    name: "Dernier email - Deces",
    subject: "Fin de mesure - Deces - {{nom_protege}}",
    body: `Madame, Monsieur,

J'ai le regret de vous informer du deces de {{nom_protege}}.

Pour cause de deces, je ne serai plus responsable de la gestion de ce dossier. La mesure de protection prend fin de plein droit.

Certains documents ou elements peuvent etre manquants car l'evenement a eu lieu en cours de mois. Le suivi pour le mois en cours a ete effectue dans la mesure du possible compte tenu des circonstances.

Les demarches de cloture du dossier sont en cours et les documents seront transmis aux ayants droit dans les meilleurs delais.

Je vous prie d'agreer, Madame, Monsieur, l'expression de mes sinceres condoleances.

{{signature}}`,
    category: "DERNIER_DECES" as const,
    isDefault: true,
  },
  {
    name: "Dernier email - Dessaisissement",
    subject: "Fin de mesure - Dessaisissement - {{nom_protege}}",
    body: `Madame, Monsieur,

Je vous informe du dessaisissement concernant la mesure de protection de {{nom_protege}}.

Pour cause de dessaisissement, je ne serai plus responsable de la gestion de ce dossier.

Certains documents ou elements peuvent etre manquants car l'evenement a eu lieu en cours de mois. Le suivi pour le mois en cours a ete effectue dans la mesure du possible.

Le dossier sera transmis au nouveau mandataire designe dans les meilleurs delais.

Je vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.

{{signature}}`,
    category: "DERNIER_DESSAISISSEMENT" as const,
    isDefault: true,
  },
];

export async function seedDefaultTemplates(userId: string): Promise<void> {
  const existingCount = await db.emailTemplate.count({
    where: { userId, dossierId: null },
  });

  if (existingCount > 0) return;

  await db.emailTemplate.createMany({
    data: DEFAULT_TEMPLATES.map((t) => ({
      ...t,
      userId,
    })),
  });
}

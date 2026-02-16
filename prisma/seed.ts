import { PrismaClient, DossierPriority, DossierStatus, ModuleType, TemplateCategory } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const adminHash = await hash("Admin123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@tutaide.fr" },
    update: { role: "ADMIN" },
    create: {
      email: "admin@tutaide.fr",
      name: "Administrateur",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log(`Created admin: ${admin.email}`);

  // Create demo user
  const passwordHash = await hash("demo1234", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@tutaide.fr" },
    update: {},
    create: {
      email: "demo@tutaide.fr",
      name: "Marie Dupont",
      passwordHash,
    },
  });

  console.log(`Created user: ${user.email}`);

  // APA dossiers
  const apaDossiers = [
    {
      fullName: "Jean-Pierre Martin",
      moduleType: ModuleType.APA,
      priority: DossierPriority.NORMAL,
      status: DossierStatus.ACTIVE,
      primaryEmail: "apa-departement@conseil-general.fr",
      notes: "Suivi APA régulier. RDV prévu le mois prochain.",
    },
    {
      fullName: "Françoise Dubois",
      moduleType: ModuleType.APA,
      priority: DossierPriority.PRIORITAIRE,
      status: DossierStatus.ACTIVE,
      primaryEmail: "apa-departement@conseil-general.fr",
      notes: "Situation financière à surveiller. Dossier APA en cours de renouvellement.",
    },
    {
      fullName: "Michel Bernard",
      moduleType: ModuleType.APA,
      priority: DossierPriority.URGENT,
      status: DossierStatus.ACTIVE,
      primaryEmail: "apa-departement@conseil-general.fr",
      ccEmails: ["notaire@cabinet.fr"],
      notes: "Succession en cours. Documents urgents à transmettre.",
    },
    {
      fullName: "Jeanne Petit",
      moduleType: ModuleType.APA,
      priority: DossierPriority.NORMAL,
      status: DossierStatus.ACTIVE,
      primaryEmail: "apa-departement@conseil-general.fr",
      notes: "Situation stable. Renouvellement APA prévu en juin.",
    },
  ];

  // ASH dossiers
  const ashDossiers = [
    {
      fullName: "Robert Moreau",
      moduleType: ModuleType.ASH,
      priority: DossierPriority.PRIORITAIRE,
      status: DossierStatus.ACTIVE,
      primaryEmail: "ash-departement@conseil-general.fr",
      notes: "Hospitalisation récente. Suivi ASH renforcé.",
    },
    {
      fullName: "Simone Lefebvre",
      moduleType: ModuleType.ASH,
      priority: DossierPriority.NORMAL,
      status: DossierStatus.CLOSED,
      primaryEmail: "ash-departement@conseil-general.fr",
      notes: "Dossier ASH clôturé suite à mainlevée.",
    },
    {
      fullName: "André Roux",
      moduleType: ModuleType.ASH,
      priority: DossierPriority.NORMAL,
      status: DossierStatus.ACTIVE,
      primaryEmail: "ash-departement@conseil-general.fr",
      notes: "En attente de décision pour renouvellement ASH.",
    },
    {
      fullName: "Monique Garcia",
      moduleType: ModuleType.ASH,
      priority: DossierPriority.URGENT,
      status: DossierStatus.ACTIVE,
      primaryEmail: "ash-departement@conseil-general.fr",
      bccEmails: ["archives@mjpm.fr"],
      notes: "Procédure de vente immobilière. Délais serrés.",
    },
  ];

  // Create a dossier that exists in both modules (linked)
  const linkedApa = await prisma.dossier.create({
    data: {
      fullName: "Marie-Claire Dupuis",
      moduleType: ModuleType.APA,
      priority: DossierPriority.PRIORITAIRE,
      status: DossierStatus.ACTIVE,
      primaryEmail: "apa-departement@conseil-general.fr",
      notes: "Dossier APA + ASH. Double suivi nécessaire.",
      userId: user.id,
    },
  });

  const linkedAsh = await prisma.dossier.create({
    data: {
      fullName: "Marie-Claire Dupuis",
      moduleType: ModuleType.ASH,
      priority: DossierPriority.PRIORITAIRE,
      status: DossierStatus.ACTIVE,
      primaryEmail: "ash-departement@conseil-general.fr",
      notes: "Dossier APA + ASH. Double suivi nécessaire.",
      linkedDossierId: linkedApa.id,
      userId: user.id,
    },
  });

  // Update APA dossier with link back
  await prisma.dossier.update({
    where: { id: linkedApa.id },
    data: { linkedDossierId: linkedAsh.id },
  });

  console.log(`Created linked dossier: ${linkedApa.fullName} (APA ↔ ASH)`);

  // Create regular dossiers
  for (const data of [...apaDossiers, ...ashDossiers]) {
    const dossier = await prisma.dossier.create({
      data: {
        ...data,
        userId: user.id,
      },
    });
    console.log(`Created dossier: ${dossier.fullName} (${data.moduleType})`);
  }

  // Email templates
  const templateData = [
    {
      name: "Email standard APA",
      subject: "Suivi APA - {{nom_protege}} - {{mois}} {{annee}}",
      body: `Madame, Monsieur,

Veuillez trouver ci-joint les éléments relatifs au suivi APA de {{nom_protege}} pour la période en cours.

Ce courrier concerne le suivi mensuel dans le cadre de l'Allocation Personnalisée d'Autonomie.

Je reste à votre disposition pour tout complément d'information.

Cordialement,
{{signature}}`,
      category: TemplateCategory.APA,
      isDefault: true,
    },
    {
      name: "Email standard ASH",
      subject: "Suivi ASH - {{nom_protege}} - {{mois}} {{annee}}",
      body: `Madame, Monsieur,

Veuillez trouver ci-joint les éléments relatifs au suivi ASH de {{nom_protege}} pour la période en cours.

Ce courrier concerne le suivi mensuel dans le cadre de l'Aide Sociale à l'Hébergement.

Je reste à votre disposition pour tout complément d'information.

Cordialement,
{{signature}}`,
      category: TemplateCategory.ASH,
      isDefault: true,
    },
    {
      name: "Dernier email - Décès",
      subject: "Fin de mesure - Décès - {{nom_protege}}",
      body: `Madame, Monsieur,

J'ai le regret de vous informer du décès de {{nom_protege}}.

Pour cause de décès, je ne serai plus responsable de la gestion de ce dossier. La mesure de protection prend fin de plein droit.

Certains documents ou éléments peuvent être manquants car l'événement a eu lieu en cours de mois. Le suivi pour le mois en cours a été effectué dans la mesure du possible compte tenu des circonstances.

Les démarches de clôture du dossier sont en cours et les documents seront transmis aux ayants droit dans les meilleurs délais.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes sincères condoléances.

{{signature}}`,
      category: TemplateCategory.DERNIER_DECES,
      isDefault: true,
    },
    {
      name: "Dernier email - Dessaisissement",
      subject: "Fin de mesure - Dessaisissement - {{nom_protege}}",
      body: `Madame, Monsieur,

Je vous informe du dessaisissement concernant la mesure de protection de {{nom_protege}}.

Pour cause de dessaisissement, je ne serai plus responsable de la gestion de ce dossier.

Certains documents ou éléments peuvent être manquants car l'événement a eu lieu en cours de mois. Le suivi pour le mois en cours a été effectué dans la mesure du possible.

Le dossier sera transmis au nouveau mandataire désigné dans les meilleurs délais.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{{signature}}`,
      category: TemplateCategory.DERNIER_DESSAISISSEMENT,
      isDefault: true,
    },
  ];

  for (const data of templateData) {
    const template = await prisma.emailTemplate.create({
      data: {
        ...data,
        userId: user.id,
      },
    });
    console.log(`Created template: ${template.name}`);
  }

  console.log("\nSeed completed successfully!");
  console.log("\nAdmin account credentials:");
  console.log("Email: admin@tutaide.fr");
  console.log("Password: Admin123!");
  console.log("\nDemo account credentials:");
  console.log("Email: demo@tutaide.fr");
  console.log("Password: demo1234");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

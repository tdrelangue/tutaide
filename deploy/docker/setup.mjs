// First run of an organisation server: creates THE organisation of this
// server and its first administrator. Run once, inside the app container:
//   docker compose run --rm app node setup.mjs --org "UDAF 75" --name "Ines Martin" \
//     --email it@udaf75.fr --role aucun
// The temporary password is read from the TUTELLIA_SETUP_PASSWORD environment
// variable (never typed on the command line, so it stays out of shell history).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const ROLES = { mandataire: "MANDATAIRE", assistant: "ASSISTANT", aucun: null };

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) args[key] = argv[i + 1];
  }
  return args;
}

function fail(message) {
  console.error(`\n[setup] ${message}\n`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const password = process.env.TUTELLIA_SETUP_PASSWORD ?? "";
  const roleKey = (args.role ?? "aucun").toLowerCase();

  if (!args.org || !args.name || !args.email) fail("Paramètres requis : --org, --name, --email (et --role mandataire|assistant|aucun)");
  if (!(roleKey in ROLES)) fail("--role doit être mandataire, assistant ou aucun");
  if (password.length < 8) fail("TUTELLIA_SETUP_PASSWORD doit contenir au moins 8 caractères");
  if (!/^\S+@\S+\.\S+$/.test(args.email)) fail("Email invalide");

  const db = new PrismaClient();
  try {
    if ((await db.organization.count()) > 0) {
      fail("Ce serveur a déjà sa structure. Les comptes s'ajoutent ensuite depuis Tutellia (Structure → Membres).");
    }
    const email = args.email.toLowerCase();
    if (await db.user.findUnique({ where: { email } })) fail("Cet email est déjà utilisé");

    const org = await db.organization.create({ data: { name: args.org } });
    await db.user.create({
      data: {
        email,
        name: args.name,
        passwordHash: await bcrypt.hash(password, 12),
        orgId: org.id,
        orgRole: ROLES[roleKey],
        isOrgAdmin: true,
        billingRequired: false,
      },
    });
    console.log(`\n[setup] Structure « ${org.name} » créée avec son administrateur ${email}.`);
    console.log("[setup] Connectez-vous avec ce compte, puis changez le mot de passe (Paramètres → Général).\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

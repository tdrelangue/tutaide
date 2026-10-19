import type { BridgeIssue } from "../bridge/issues";
import type { IssueView } from "./types";

/**
 * Plain-French messages for the rows the bridge could not use. Messages carry
 * counts only: never a name, an address or a row id (protected-person data).
 * Several rows with the same reason give one message.
 */

type Template = {
  /** Message for one row / for several ({n} is replaced by the count). */
  readonly one: string;
  readonly many: string;
  readonly fixTab: string | null;
};

const SETTINGS_TAB = "parametres";
const PERSONS_TAB = "personnes";
const APPOINTMENTS_TAB = "rendez-vous";

const TEMPLATES: Readonly<Record<string, Template>> = {
  NO_HOME: {
    one: "Indiquez l'adresse de votre domicile dans les paramètres : elle sert de point de départ à vos tournées.",
    many: "",
    fixTab: SETTINGS_TAB,
  },
  NO_WORK_DAYS: { one: "Choisissez au moins un jour travaillé dans les paramètres.", many: "", fixTab: SETTINGS_TAB },
  BAD_TIMEZONE: {
    one: "Le fuseau horaire enregistré n'est pas reconnu : l'heure de Paris est utilisée en attendant. Corrigez-le dans les paramètres.",
    many: "",
    fixTab: SETTINGS_TAB,
  },
  LAST_VISIT_UNKNOWN: {
    one: "{n} personne sans date de dernière visite : la visite est proposée dès maintenant.",
    many: "{n} personnes sans date de dernière visite : la visite est proposée dès maintenant.",
    fixTab: PERSONS_TAB,
  },
  BAD_AVAILABILITY: {
    one: "Les disponibilités d'une personne sont illisibles : elle est considérée disponible à vos heures de travail.",
    many: "Les disponibilités de {n} personnes sont illisibles : elles sont considérées disponibles à vos heures de travail.",
    fixTab: PERSONS_TAB,
  },
  VISITS_INCOMPLETE: {
    one: "Les visites régulières d'une personne sont incomplètes (fréquence ou période manquante) : elle n'est pas planifiée.",
    many: "Les visites régulières de {n} personnes sont incomplètes (fréquence ou période manquante) : elles ne sont pas planifiées.",
    fixTab: PERSONS_TAB,
  },
  VISITS_INVALID: {
    one: "La fréquence des visites d'une personne ne peut pas être planifiée (au plus une visite par jour) : elle est ignorée.",
    many: "La fréquence des visites de {n} personnes ne peut pas être planifiée (au plus une visite par jour) : elles sont ignorées.",
    fixTab: PERSONS_TAB,
  },
  PREF_DAY_INVALID: {
    one: "Le jour préféré d'une personne est invalide : il est ignoré.",
    many: "Le jour préféré de {n} personnes est invalide : il est ignoré.",
    fixTab: PERSONS_TAB,
  },
  UNSUPPORTED_RULE: {
    one: "Une règle de vos créneaux n'est pas prise en charge : elle est ignorée.",
    many: "{n} règles de vos créneaux ne sont pas prises en charge : elles sont ignorées.",
    fixTab: SETTINGS_TAB,
  },
  BAD_RULE: {
    one: "Une règle de vos créneaux est incomplète : elle est ignorée.",
    many: "{n} règles de vos créneaux sont incomplètes : elles sont ignorées.",
    fixTab: SETTINGS_TAB,
  },
  PLACE_MISSING: {
    one: "Un rendez-vous n'a plus de lieu : il n'est pas planifié.",
    many: "{n} rendez-vous n'ont plus de lieu : ils ne sont pas planifiés.",
    fixTab: APPOINTMENTS_TAB,
  },
  BAD_WHEN: {
    one: "Les dates d'un rendez-vous sont invalides : il n'est pas planifié.",
    many: "Les dates de {n} rendez-vous sont invalides : ils ne sont pas planifiés.",
    fixTab: APPOINTMENTS_TAB,
  },
  PLACE_NO_POINT: {
    one: "Une adresse n'a pas pu être localisée : elle est ignorée. Saisissez-la à nouveau.",
    many: "{n} adresses n'ont pas pu être localisées : elles sont ignorées. Saisissez-les à nouveau.",
    fixTab: PERSONS_TAB,
  },
  PARTICIPANT_UNKNOWN: {
    one: "Un bloc placé à la main concerne une personne qui n'existe plus.",
    many: "{n} blocs placés à la main concernent des personnes qui n'existent plus.",
    fixTab: null,
  },
  BAD_KEY: {
    one: "Un choix « Pas cette fois » est illisible : il est ignoré.",
    many: "{n} choix « Pas cette fois » sont illisibles : ils sont ignorés.",
    fixTab: null,
  },
};

const FALLBACK: Template = {
  one: "Une donnée de l'agenda n'a pas pu être lue : elle est ignorée.",
  many: "{n} données de l'agenda n'ont pas pu être lues : elles sont ignorées.",
  fixTab: null,
};

function messageFor(template: Template, count: number): string {
  const text = count > 1 && template.many !== "" ? template.many : template.one;
  return text.replace("{n}", String(count));
}

/** One view per reason, in order of first appearance. */
export function toIssueViews(issues: readonly BridgeIssue[]): IssueView[] {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.reason, (counts.get(issue.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => {
    const template = TEMPLATES[reason] ?? FALLBACK;
    return { kind: reason, message: messageFor(template, count), fixTab: template.fixTab };
  });
}

/**
 * Guided tours. Each step opens a page (and a Settings tab), then highlights
 * the element marked data-tour="…" with a short explanation. A step without
 * a selector, or whose element is missing, shows a centred message instead.
 */

export type TourId = "configuration" | "prise-en-main";

export type TourStep = {
  path: string;
  /** Settings tab to open (?tab=…). */
  tab?: string;
  /** data-tour value of the element to highlight. */
  target?: string;
  title: string;
  text: string;
  side?: "top" | "right" | "bottom" | "left";
};

export type Tour = { id: TourId; label: string; summary: string; steps: TourStep[] };

export const TOURS: Record<TourId, Tour> = {
  configuration: {
    id: "configuration",
    label: "Visite guidée : configuration",
    summary: "Les réglages à faire une fois : signature, envoi des emails, destinataires et modèles.",
    steps: [
      {
        path: "/dashboard",
        title: "Bienvenue dans Tutellia",
        text: "Cette visite vous montre les réglages à faire une seule fois avant d'envoyer vos premiers emails. Comptez cinq minutes. Vous pouvez la quitter à tout moment et la relancer depuis Paramètres › Général.",
      },
      {
        path: "/dashboard",
        target: "user-menu",
        side: "left",
        title: "Vos paramètres",
        text: "Tous les réglages se trouvent ici : cliquez sur votre avatar, puis sur Paramètres. La visite vous y emmène.",
      },
      {
        path: "/settings",
        tab: "general",
        target: "signature",
        side: "top",
        title: "1. Votre signature",
        text: "Écrivez votre signature de mandataire telle qu'elle doit apparaître en bas de vos emails (nom, fonction, téléphone), puis Enregistrer. Elle s'ajoute partout où un modèle contient {{signature}}.",
      },
      {
        path: "/settings",
        tab: "smtp",
        target: "smtp-provider",
        side: "bottom",
        title: "2. L'envoi des emails",
        text: "Tutellia envoie les emails depuis votre propre adresse. Choisissez votre fournisseur (Gmail, Outlook, OVH…) : le serveur et le port se remplissent tout seuls.",
      },
      {
        path: "/settings",
        tab: "smtp",
        target: "smtp-credentials",
        side: "top",
        title: "Votre adresse et votre mot de passe",
        text: "Indiquez votre adresse email complète et son mot de passe. Pour Gmail, il faut un « mot de passe d'application » : le guide « Configurer l'envoi des emails » (menu Guides) l'explique en deux minutes.",
      },
      {
        path: "/settings",
        tab: "smtp",
        target: "smtp-actions",
        side: "top",
        title: "Tester, puis enregistrer",
        text: "Cliquez sur « Tester la connexion » : le message « Connexion réussie » confirme que tout est bon. Cliquez ensuite sur Enregistrer.",
      },
      {
        path: "/settings",
        tab: "apa",
        target: "module-config",
        side: "top",
        title: "3. Les destinataires",
        text: "Pour chaque module (onglets APA, ASH, PCH), indiquez l'adresse du service du département qui reçoit vos envois. Le dossier IMAP, facultatif, range une copie de chaque email envoyé dans votre messagerie.",
      },
      {
        path: "/settings",
        tab: "apa",
        target: "module-templates",
        side: "top",
        title: "4. Les modèles d'emails",
        text: "L'objet et le texte de vos emails. Le modèle « Par défaut » sert aux envois. Les mots entre doubles accolades sont remplacés automatiquement : {{nom_protege}}, {{trimestre}}{{suffix}}, {{mois}}, {{annee}}, {{signature}}.",
      },
      {
        path: "/settings",
        tab: "dernier",
        target: "dernier-templates",
        side: "top",
        title: "5. Les derniers emails",
        text: "Les modèles de fin de mesure, pour un décès ou un dessaisissement. Ils servent à l'envoi du dernier email d'un dossier, qui le clôture. Relisez-les une fois.",
      },
      {
        path: "/settings",
        tab: "general",
        target: "tours",
        side: "top",
        title: "C'est prêt",
        text: "Une fois ces réglages enregistrés, votre Tutellia est opérationnel. La visite « prise en main » vous montre ensuite comment créer un dossier et envoyer vos emails. Vous la retrouverez ici.",
      },
    ],
  },
  "prise-en-main": {
    id: "prise-en-main",
    label: "Visite guidée : prise en main",
    summary: "Créer un dossier, envoyer les emails, suivre l'historique et les notifications.",
    steps: [
      {
        path: "/dashboard",
        title: "Prise en main",
        text: "Cette visite vous montre le travail de tous les jours : vos dossiers, l'envoi des emails et leur suivi. Comptez trois minutes.",
      },
      {
        path: "/dashboard",
        target: "sidebar",
        side: "right",
        title: "Le menu",
        text: "Vos modules APA, ASH et PCH apparaissent ici dès que leur adresse de destination est réglée (Paramètres). Chacun regroupe ses dossiers et son historique d'envois.",
      },
      {
        path: "/apa/dossiers",
        target: "dossier-new",
        side: "bottom",
        title: "Créer un dossier",
        text: "Un dossier par personne protégée : son nom, sa priorité, les adresses éventuelles en copie. Vous y ajoutez ensuite les documents à envoyer (PDF, images).",
      },
      {
        path: "/apa/dossiers",
        target: "dossier-filters",
        side: "bottom",
        title: "Retrouver un dossier",
        text: "Recherchez par nom, filtrez par statut (actif ou clos) et choisissez le tri. Tutellia mémorise vos choix.",
      },
      {
        path: "/apa/dossiers",
        target: "dossier-list",
        side: "top",
        title: "La fiche d'un dossier",
        text: "Cliquez sur un dossier pour ouvrir sa fiche : informations, documents, envoi d'un email et, en fin de mesure, le dernier email qui clôture le dossier.",
      },
      {
        path: "/apa/dossiers",
        target: "dossier-selection",
        side: "bottom",
        title: "Envoyer à plusieurs dossiers",
        text: "Le mode sélection permet de cocher plusieurs dossiers, puis de les envoyer en une fois : un email par dossier, à l'adresse email renseignée dans la fiche de chaque dossier.",
      },
      {
        path: "/apa/dossiers",
        target: "dossier-send-all",
        side: "bottom",
        title: "Tout envoyer",
        text: "Envoie en une fois tous les dossiers actifs qui ont des documents, par exemple pour l'envoi trimestriel. Tutellia vous fait confirmer le trimestre avant l'envoi.",
      },
      {
        path: "/apa/history",
        target: "history",
        side: "bottom",
        title: "L'historique des envois",
        text: "Chaque email envoyé est listé ici avec son statut (envoyé ou en échec). Un envoi en échec peut être renvoyé.",
      },
      {
        path: "/dashboard",
        target: "notifications",
        side: "left",
        title: "Les notifications",
        text: "Les nouveautés et les messages importants arrivent sous cette cloche. Le chiffre indique les messages non lus.",
      },
      {
        path: "/dashboard",
        title: "Bonne utilisation !",
        text: "Les guides détaillés sont dans « Consulter les guides » sur le tableau de bord, et les visites guidées se relancent depuis Paramètres › Général. Une question : thomas.drelangue@origai.fr",
      },
    ],
  },
};

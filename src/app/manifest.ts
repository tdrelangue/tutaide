import type { MetadataRoute } from "next";

/**
 * Lets Tutellia be installed on a phone from the hosted site (« Ajouter à
 * l'écran d'accueil »): it opens full screen, on the agenda. No service
 * worker: nothing about protected persons is ever cached on the phone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tutellia",
    short_name: "Tutellia",
    description: "Agenda et dossiers des mandataires judiciaires à la protection des majeurs",
    lang: "fr",
    start_url: "/agenda",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

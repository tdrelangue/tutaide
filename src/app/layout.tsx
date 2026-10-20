import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tutellia - Gestion des dossiers MJPM",
  description: "Application de gestion des dossiers pour les mandataires judiciaires à la protection des majeurs",
  icons: {
    icon: "/icon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  applicationName: "Tutellia",
  // iPhone: installed from Safari (« Sur l'écran d'accueil »), it opens full screen.
  appleWebApp: { capable: true, title: "Tutellia", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <a href="#main-content" className="skip-link">
          Aller au contenu principal
        </a>
        <TooltipProvider delayDuration={300}>
          {children}
        </TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}

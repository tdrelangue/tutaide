"use client";

import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDesktopConnection, openConnectionSettings, type DesktopConnection } from "@/lib/desktop-open";

/**
 * Settings → Général, desktop app only: where Tutellia runs (this computer or
 * the organisation's server) and the way to change it.
 */
export function ConnectionCard() {
  const [connection, setConnection] = useState<DesktopConnection | null>(null);
  useEffect(() => {
    void getDesktopConnection().then(setConnection);
  }, []);

  if (!connection) return null; // plain browser: nothing to choose

  const where =
    connection.mode === "server"
      ? `Serveur de votre structure : ${connection.url ?? ""}`
      : "Sur cet ordinateur";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" aria-hidden="true" /> Connexion
        </CardTitle>
        <CardDescription>
          Où cette application trouve Tutellia. Si votre structure a son propre serveur, son
          administrateur vous donne son adresse.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <span className="font-medium">{where}</span>
          <span className="text-muted-foreground"> · application {connection.appVersion}</span>
        </p>
        <Button variant="outline" onClick={() => void openConnectionSettings()}>
          Changer de connexion…
        </Button>
      </CardContent>
    </Card>
  );
}

/** Login page, desktop app only: reach the connection choice before logging in. */
export function ConnectionLink() {
  const [connection, setConnection] = useState<DesktopConnection | null>(null);
  useEffect(() => {
    void getDesktopConnection().then(setConnection);
  }, []);
  if (!connection) return null;
  const label = connection.mode === "server" ? "Changer de serveur ou utiliser cet ordinateur" : "Votre structure a son propre serveur ?";
  return (
    <p className="mt-4 text-center text-sm">
      <button type="button" className="text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => void openConnectionSettings()}>
        {label}
      </button>
    </p>
  );
}

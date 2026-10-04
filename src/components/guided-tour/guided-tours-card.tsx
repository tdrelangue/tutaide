"use client";

import { Compass, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useGuidedTour } from "./tour-provider";
import { TOURS } from "./tours";

/** Paramètres › Général: relaunch either guided tour at any time. */
export function GuidedToursCard() {
  const { startTour } = useGuidedTour();

  return (
    <Card data-tour="tours">
      <CardHeader>
        <CardTitle>Visites guidées</CardTitle>
        <CardDescription>
          Tutellia vous emmène sur les bonnes pages et vous montre chaque réglage. Quittez quand vous
          voulez avec la croix ou la touche Échap.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => startTour("configuration")}>
          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {TOURS.configuration.label}
        </Button>
        <Button type="button" variant="outline" onClick={() => startTour("prise-en-main")}>
          <Compass className="mr-2 h-4 w-4" aria-hidden="true" />
          {TOURS["prise-en-main"].label}
        </Button>
      </CardContent>
    </Card>
  );
}

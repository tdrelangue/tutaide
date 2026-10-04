"use client";

import { useEffect, useState } from "react";
import { Compass, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TOURS, type TourId } from "./tours";

const OFFERED_KEY_PREFIX = "tutellia:tours-offered:";

function wasOffered(userId: string): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY_PREFIX + userId) === "1";
  } catch {
    return true; // storage unavailable: never nag
  }
}

function markOffered(userId: string): void {
  try {
    localStorage.setItem(OFFERED_KEY_PREFIX + userId, "1");
  } catch {
    // ignore: the dialog may simply be offered again
  }
}

/** Offers the two guided tours once per user, on their first visit. */
export function WelcomeTourDialog({ userId, onStart }: { userId: string; onStart: (id: TourId) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!wasOffered(userId)) setOpen(true);
  }, [userId]);

  function close() {
    markOffered(userId);
    setOpen(false);
  }

  function handleStart(id: TourId) {
    close();
    onStart(id);
  }

  function handleOpenChange(next: boolean) {
    if (!next) close();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bienvenue dans Tutellia</DialogTitle>
          <DialogDescription>
            Deux visites guidées de quelques minutes vous montrent l&apos;essentiel, directement dans
            l&apos;application. Vous pourrez les relancer à tout moment depuis Paramètres › Général.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Button type="button" className="h-auto justify-start py-3 text-left" onClick={() => handleStart("configuration")}>
            <Settings2 className="mr-3 h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="flex flex-col items-start">
              <span className="font-medium">{TOURS.configuration.label}</span>
              <span className="text-xs font-normal opacity-90 whitespace-normal">{TOURS.configuration.summary}</span>
            </span>
          </Button>
          <Button type="button" variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => handleStart("prise-en-main")}>
            <Compass className="mr-3 h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="flex flex-col items-start">
              <span className="font-medium">{TOURS["prise-en-main"].label}</span>
              <span className="text-xs font-normal text-muted-foreground whitespace-normal">{TOURS["prise-en-main"].summary}</span>
            </span>
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            Plus tard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

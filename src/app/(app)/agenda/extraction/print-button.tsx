"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the print dialog; « Enregistrer au format PDF » gives the PDF. */
export function PrintButton() {
  function handlePrint() {
    window.print();
  }
  return (
    <Button type="button" onClick={handlePrint}>
      <Printer aria-hidden="true" />
      Imprimer ou enregistrer en PDF
    </Button>
  );
}

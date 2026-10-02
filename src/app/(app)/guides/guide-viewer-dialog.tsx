"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfRenderer } from "@/components/pdf-preview";

interface GuideViewerDialogProps {
  title: string;
  url: string;
}

export function GuideViewerDialog({ title, url }: GuideViewerDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Eye className="h-4 w-4 mr-2" aria-hidden="true" />
        Consulter
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="truncate pr-8">{title}</DialogTitle>
          </DialogHeader>
          {open && <PdfRenderer url={url} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

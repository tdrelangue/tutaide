"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { listOrigPdfInbox, reportModulesToOrigPdf, type OrigPdfModule } from "@/lib/origpdf";

const NOTICE_KEY = "tutellia.origpdfInboxNotice";
const NOTICE_MS = 15_000;

/** Once per app session: has the person already been told? */
function alreadyNoticed(): boolean {
  try {
    if (sessionStorage.getItem(NOTICE_KEY)) return true;
    sessionStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // Storage unavailable: tell them anyway.
  }
  return false;
}

/**
 * Desktop app only, renders nothing. Tells OrigPDF which modules this person
 * works with, and once per session says when documents sent from OrigPDF are
 * waiting to be filed, with a way straight to them.
 */
export function OrigPdfBridge({ modules }: { modules: string[] }) {
  const router = useRouter();
  const moduleList = modules.join(",");

  useEffect(() => {
    void reportModulesToOrigPdf(moduleList ? moduleList.split(",") : []);
  }, [moduleList]);

  useEffect(() => {
    const active = new Set(moduleList.toUpperCase().split(","));
    void listOrigPdfInbox().then((items) => {
      const waiting = items.filter((item) => active.has(item.module));
      const first: OrigPdfModule | undefined = waiting[0]?.module;
      if (!first || alreadyNoticed()) return;
      const count = waiting.length;
      toast.info(`${count} document${count > 1 ? "s" : ""} envoyé${count > 1 ? "s" : ""} depuis OrigPDF à ranger`, {
        duration: NOTICE_MS,
        action: { label: "Ranger", onClick: () => router.push(`/${first.toLowerCase()}/dossiers`) },
      });
    });
  }, [moduleList, router]);

  return null;
}

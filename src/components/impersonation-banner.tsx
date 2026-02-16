"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stopImpersonationAction } from "@/app/(app)/admin/actions";

interface ImpersonationBannerProps {
  targetEmail: string;
  targetName: string | null;
}

export function ImpersonationBanner({
  targetEmail,
  targetName,
}: ImpersonationBannerProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleStop() {
    setIsLoading(true);
    await stopImpersonationAction();
    router.push("/admin/users");
    router.refresh();
  }

  const displayName = targetName ?? targetEmail;

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium z-50">
      <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Mode administrateur : vous visualisez le compte de{" "}
        <strong>{displayName}</strong>
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 bg-amber-600 border-amber-700 text-amber-50 hover:bg-amber-700 hover:text-white"
        onClick={handleStop}
        disabled={isLoading}
      >
        <X className="h-3 w-3 mr-1" />
        Quitter
      </Button>
    </div>
  );
}

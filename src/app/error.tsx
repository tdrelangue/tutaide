"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";

/**
 * The app's frame itself (menu, account check) could not be rendered: the
 * whole screen shows this message instead of a blank page, retrying on its own.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [router, reset]);

  return <ServiceUnavailable onRetry={retry} digest={error.digest} />;
}

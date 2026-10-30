"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";

/**
 * A page of the app could not be rendered on the server: the menu stays on
 * screen and this message replaces only the page, retrying on its own.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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

"use client";

import "./globals.css";
import { ServiceUnavailable } from "@/components/service-unavailable";

function reload() {
  window.location.reload();
}

/** Last resort: even the root layout failed. Same message, its own <html>. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="fr">
      <body>
        <ServiceUnavailable onRetry={reload} digest={error.digest} />
      </body>
    </html>
  );
}

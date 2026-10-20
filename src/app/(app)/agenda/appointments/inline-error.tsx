"use client";

import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IssueView } from "@/lib/agenda/views/types";
import { ERROR_TEXT } from "../address-field";
import { fixTarget } from "../fix-links";

type InlineErrorProps = {
  readonly message: string | null;
  readonly issues?: readonly IssueView[];
  /** Shown as « Réessayer ». */
  readonly onRetry?: () => void;
  /** Move the focus to the message when it appears (inside dialogs). */
  readonly focusOnShow?: boolean;
};

/** An error shown in place, announced to screen readers, never only as a toast. */
export function InlineError({ message, issues = [], onRetry, focusOnShow = false }: InlineErrorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusOnShow && message !== null) ref.current?.focus();
  }, [focusOnShow, message]);

  if (message === null && issues.length === 0) return null;
  return (
    <div ref={ref} role="alert" tabIndex={-1} className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {message && <p className={ERROR_TEXT}>{message}</p>}
      {issues.length > 0 && <IssueList issues={issues} />}
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Réessayer
        </Button>
      )}
    </div>
  );
}


export function IssueList({ issues }: { readonly issues: readonly IssueView[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">
      {issues.map((issue, index) => (
        <li key={`${issue.kind}-${index}`}>
          {issue.message}
          {fixTarget(issue.fixTab) && (
            <span className="text-muted-foreground"> (à corriger dans « {fixTarget(issue.fixTab)?.label} »)</span>
          )}
        </li>
      ))}
    </ul>
  );
}

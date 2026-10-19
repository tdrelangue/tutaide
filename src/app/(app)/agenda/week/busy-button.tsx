"use client";

import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BusyButtonProps = ButtonProps & {
  /** While true the button stays focusable but ignores clicks (aria-disabled), so focus never falls to <body>. */
  readonly busy: boolean;
};

/**
 * A button that pauses while work is in flight. A `disabled` button loses
 * focus (WCAG 2.4.3); this one keeps it and announces itself as unavailable.
 * `disabled` stays for reasons other than « busy » (nothing to act on).
 */
export const BusyButton = forwardRef<HTMLButtonElement, BusyButtonProps>(function BusyButton(
  { busy, onClick, className, ...props },
  ref,
) {
  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (busy) {
      // Also stops a type="submit" button from submitting its form.
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }
  return (
    <Button
      ref={ref}
      {...props}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      className={cn(busy && "cursor-not-allowed opacity-50", className)}
    />
  );
});

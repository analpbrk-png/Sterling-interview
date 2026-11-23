"use client";
import { useFormStatus } from "react-dom";
import { Button } from "./index";
import type { ComponentProps } from "react";

/** Disables itself while the form submits, preventing double submissions. */
export function SubmitButton({ children, pendingText, ...p }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || p.disabled} aria-busy={pending} {...p}>
      {pending ? pendingText ?? "Saving…" : children}
    </Button>
  );
}

export function ConfirmSubmit({ message, children, ...p }: ComponentProps<typeof Button> & { message: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...p}
    >
      {children}
    </Button>
  );
}

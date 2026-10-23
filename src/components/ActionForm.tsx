'use client';

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from 'react';

export type FormState = { error?: string; notice?: string } | undefined;

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  confirmText?: string;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
};

// Submits via onSubmit instead of the `action` prop: React resets `action` forms even when the
// server returns a validation error, wiping what the user typed. Here fields reset only on success.
export function ActionForm({ action, submitLabel, confirmText, className, disabled, children }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.notice) form.current?.reset();
  }, [state]);

  return (
    <form
      ref={form}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      <button type="submit" disabled={pending || disabled}>
        {pending ? 'Working…' : submitLabel}
      </button>
      {state?.error && <p role="alert" className="error">{state.error}</p>}
      {state?.notice && <p role="status" className="notice">{state.notice}</p>}
    </form>
  );
}

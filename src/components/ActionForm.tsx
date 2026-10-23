'use client';

import { useActionState, type ReactNode } from 'react';

export type FormState = { error?: string; notice?: string } | undefined;

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  confirmText?: string;
  children?: ReactNode;
};

export function ActionForm({ action, submitLabel, confirmText, children }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={confirmText ? (e) => !window.confirm(confirmText) && e.preventDefault() : undefined}
    >
      {children}
      <button type="submit" disabled={pending}>
        {pending ? 'Working…' : submitLabel}
      </button>
      {state?.error && <p role="alert" className="error">{state.error}</p>}
      {state?.notice && <p role="status" className="notice">{state.notice}</p>}
    </form>
  );
}

'use client';

import { logout } from '@/app/actions';

// Participants logged out by mistake mid-event; ask first. Logging back in works with the same ID and code.
export function LogoutButton() {
  return (
    <form
      action={logout}
      onSubmit={(e) => {
        if (!window.confirm('Log out? You can log back in with the same ID and code.')) e.preventDefault();
      }}
    >
      <button type="submit" className="secondary">
        Log out
      </button>
    </form>
  );
}

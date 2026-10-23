import Link from 'next/link';
import { LiveRefresh } from '@/components/LiveRefresh';
import { logout } from '../actions';

export function AdminHeader() {
  return (
    <header className="row">
      <nav className="row">
        <strong>Admin</strong>
        <Link href="/admin/event">Event &amp; projector</Link>
        <Link href="/admin">Participants</Link>
        <Link href="/admin/matching">Matching</Link>
        <Link href="/admin/teams">Teams &amp; submissions</Link>
      </nav>
      <form action={logout}>
        <button type="submit" className="secondary">
          Log out
        </button>
      </form>
      <LiveRefresh />
    </header>
  );
}

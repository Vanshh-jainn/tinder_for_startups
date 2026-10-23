import Link from 'next/link';
import { logout } from '../actions';

export function AdminHeader() {
  return (
    <header className="row">
      <nav className="row">
        <strong>Admin</strong>
        <Link href="/admin">Participants</Link>
        <Link href="/admin/matching">Matching &amp; teams</Link>
      </nav>
      <form action={logout}>
        <button type="submit" className="secondary">
          Log out
        </button>
      </form>
    </header>
  );
}

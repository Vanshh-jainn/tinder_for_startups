'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LiveRefresh } from '@/components/LiveRefresh';
import { Flame } from '@/components/TinderLogo';
import { logout } from '../actions';

const LINKS = [
  ['/admin/event', 'Event & projector'],
  ['/admin', 'Participants'],
  ['/admin/matching', 'Matching'],
  ['/admin/teams', 'Teams & submissions'],
  ['/admin/marketplace', 'Marketplace'],
  ['/admin/qualification', 'Qualification'],
] as const;

export function AdminHeader() {
  const path = usePathname();
  return (
    <header className="admin-bar">
      <strong className="admin-brand">
        <Flame className="admin-flame" />
        <span className="wordmark">Admin</span>
      </strong>
      <nav>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
            {label}
          </Link>
        ))}
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

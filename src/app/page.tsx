import Link from 'next/link';
import { TinderLogo } from '@/components/TinderLogo';

export default function Home() {
  return (
    <main className="narrow app auth">
      <h1 className="brand">
        <TinderLogo className="brand-logo" />
        <span className="wordmark">for Startups</span>
      </h1>
      <p className="muted">DAMRU · Rishihood University</p>
      <p className="tagline">Swipe. Match. Build a startup.</p>
      <nav className="stack">
        <Link className="button" href="/login">
          Participant login
        </Link>
        <Link href="/admin/login">Admin</Link>
      </nav>
    </main>
  );
}

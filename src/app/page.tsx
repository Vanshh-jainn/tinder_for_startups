import Link from 'next/link';

export default function Home() {
  return (
    <main className="narrow">
      <h1>Tinder for Startups</h1>
      <p className="muted">DAMRU · Rishihood University</p>
      <nav className="stack">
        <Link className="button" href="/login">
          Participant login
        </Link>
        <Link href="/admin/login">Admin</Link>
      </nav>
    </main>
  );
}

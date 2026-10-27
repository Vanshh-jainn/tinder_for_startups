import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// Self-hosted at build time: no request to Google from the hall.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' });
const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Tinder for Startups',
  description: 'DAMRU, Rishihood University',
};

export const viewport: Viewport = {
  themeColor: '#14080e',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}

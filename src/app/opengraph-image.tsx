import { ImageResponse } from 'next/og';

// Link preview (WhatsApp, Instagram, LinkedIn…). Built once at build time; no request-time data.
export const alt = 'Tinder for Startups · DAMRU, Rishihood University';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const FLAME =
  'M31.5 49.6C55 41.5 59 20.4 56 1c0-.7.6-1.2 1.2-1C79.7 11 105 35 105 71c0 27.6-21.4 52-52.5 52a50 50 0 0 1-28.2-92.7c.6-.4 1.4 0 1.4.7.3 3.7 1.3 13 5.4 18.6h.4z';
const HEARTS = [
  { left: 80, top: 70, size: 54, opacity: 0.35 },
  { left: 1040, top: 90, size: 72, opacity: 0.3 },
  { left: 150, top: 470, size: 40, opacity: 0.25 },
  { left: 1000, top: 450, size: 48, opacity: 0.35 },
  { left: 560, top: 540, size: 30, opacity: 0.2 },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 30%, #5a0f33 0%, #14080e 70%)',
          color: '#fff2f6',
          fontFamily: 'sans-serif',
        }}
      >
        {HEARTS.map((h, i) => (
          <div key={i} style={{ position: 'absolute', left: h.left, top: h.top, fontSize: h.size, color: '#ff3d7f', opacity: h.opacity }}>
            ♥
          </div>
        ))}
        <svg width="120" height="138" viewBox="-9 0 123 123">
          <defs>
            <linearGradient id="f" x1="100%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#FF7854" />
              <stop offset="100%" stopColor="#FD267D" />
            </linearGradient>
          </defs>
          <path fill="url(#f)" d={FLAME} />
        </svg>
        <div style={{ display: 'flex', fontSize: 92, fontWeight: 800, letterSpacing: -2, marginTop: 24 }}>
          <span>Tinder</span>
          <span style={{ marginLeft: 24, color: '#ff6fa5' }}>for Startups</span>
        </div>
        <div style={{ fontSize: 40, marginTop: 20, color: '#ff8fb4' }}>Swipe. Match. Build a startup.</div>
        <div style={{ fontSize: 28, marginTop: 36, color: '#c4a3b3', letterSpacing: 2 }}>DAMRU · RISHIHOOD UNIVERSITY</div>
      </div>
    ),
    size,
  );
}

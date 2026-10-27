// Floating hearts behind the content: 8 spans, CSS transform/opacity only (off under reduced motion).
export function Hearts() {
  return (
    <div className="hearts" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <span key={i}>♥</span>
      ))}
    </div>
  );
}

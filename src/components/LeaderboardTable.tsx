import type { Leaderboard } from '@/server/queries';

// Counted totals only. Shared by the admin marketplace page and the projector.
export function LeaderboardTable({ board }: { board: Leaderboard }) {
  return (
    <>
      <p className="muted">
        {board.complete} of {board.teams} teams fully confirmed. Only fully confirmed teams&apos; investments count.
      </p>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>#</th>
            <th>Startup</th>
            <th>Invested</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((r) => (
            <tr key={r.teamId}>
              <td>{r.rank}</td>
              <td>Team {r.number}</td>
              <td>₹{r.total.toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

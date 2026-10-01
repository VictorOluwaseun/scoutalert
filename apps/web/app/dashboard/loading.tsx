/** Keeps navigation loading explicit without displaying invented counts or scout records. */
export default function DashboardLoading() {
  return (
    <main className="workspace-loading" aria-busy="true">
      <p>Loading your dashboard…</p>
    </main>
  );
}

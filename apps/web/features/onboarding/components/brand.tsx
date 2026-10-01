/** ScoutAlert's compass mark, built as a crisp vector for any viewport or theme. */
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`scout-brand ${small ? "scout-brand-small" : ""}`}>
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        aria-hidden="true"
      >
        <rect width="34" height="34" rx="11" fill="currentColor" />
        <path d="m22.5 10.5-3.2 8.8-8.8 3.2 3.2-8.8 8.8-3.2Z" fill="#D9EF70" />
        <path d="m14 14 5.4 5.4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span>ScoutAlert</span>
    </span>
  );
}

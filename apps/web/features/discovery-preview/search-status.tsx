"use client";

import { Icon } from "@repo/ui/components/icon";
import { previewSearchStates } from "./fixtures";
import { usePreview } from "./preview-context";

/** Describes actual progress in the selected sample state without inventing a completion percentage. */
export function SearchStatus({
  paused = false,
  plural = false,
}: {
  paused?: boolean;
  plural?: boolean;
}) {
  const { scenario } = usePreview();
  const state = previewSearchStates[scenario];

  if (paused) {
    return (
      <section className="dp-search-status">
        <span className="dp-status-symbol">
          <Icon name="clock" size={24} />
        </span>
        <div>
          <h2>
            {plural ? "Your scouts are paused." : "This scout is paused."}
          </h2>
          <p>
            Earlier finds remain available. Resume when you’re ready for new
            searches and alerts.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`dp-search-status dp-state-${scenario}`}
      aria-label="Search status"
    >
      <span className="dp-status-symbol">
        <Icon
          name={scenario === "interrupted" ? "clock" : "compass"}
          size={25}
        />
      </span>
      <div>
        <h2>{state.title}</h2>
        <p>{state.description}</p>
      </div>
      <a href="#search-coverage" className="dp-text-link">
        View coverage
      </a>
    </section>
  );
}

/** Shows where a sample search reached, including access gaps and the difference between found and verified. */
export function SearchCoverage({ paused = false }: { paused?: boolean }) {
  const { scenario } = usePreview();
  const pending = scenario === "searching";
  const interrupted = scenario === "interrupted";
  const publicPostStates = {
    ready: "Checked",
    searching: "Queued",
    empty: "Checked",
    partial: "Access limited",
    interrupted: "Interrupted",
  };
  const openWebState = paused ? "Paused" : "Searching";
  const rows = [
    {
      name: "The open web",
      description: "Search results, pages and communities",
      state: pending ? openWebState : "Checked",
      icon: "globe" as const,
    },
    {
      name: "Company websites",
      description: "Careers pages and direct listings",
      state: pending ? "Queued" : "Checked",
      icon: "briefcase" as const,
    },
    {
      name: "X",
      description: "Public posts found through search",
      state: publicPostStates[scenario],
      icon: "search" as const,
    },
    {
      name: "LinkedIn",
      description: "Public pages visible in search",
      state: interrupted ? "Waiting to retry" : "Partial access",
      icon: "search" as const,
    },
  ];

  return (
    <section
      className="dp-coverage"
      id="search-coverage"
      aria-labelledby="coverage-title"
    >
      <div className="dp-section-heading">
        <h2 id="coverage-title">Search coverage</h2>
        <Icon name="globe" size={20} />
      </div>
      <p className="dp-muted">
        {paused
          ? "Coverage from before the pause."
          : "A view of this sample search, not the whole internet."}
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.name}>
            <div className="dp-coverage-name">
              <Icon name={row.icon} size={18} />
              <strong>{row.name}</strong>
            </div>
            <span
              className={`dp-coverage-state ${row.state === "Checked" ? "is-checked" : ""}`}
            >
              {row.state}
            </span>
            <p>{row.description}</p>
          </li>
        ))}
      </ul>
      <details className="dp-coverage-note">
        <summary>What does “checked” mean?</summary>
        <p>
          Some accessible results were checked during this search. It doesn’t
          mean every page or post was found. Private posts, sign-in restrictions
          and indexing delays can leave gaps.
        </p>
      </details>
    </section>
  );
}

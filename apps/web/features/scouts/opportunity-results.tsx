"use client";

import { useState, type ReactNode } from "react";

const filters = [
  { value: "all", label: "All results" },
  { value: "job", label: "Jobs & contracts" },
  { value: "client_request", label: "Client requests" },
  { value: "assessed", label: "Fit reviewed" },
] as const;

type OpportunityFilter = (typeof filters)[number]["value"];

/** Pairs a display category with server-rendered content; no source data or account credentials are read by this component. */
interface ResultItem {
  id: string;
  kind: "job" | "client_request";
  assessed: boolean;
  card: ReactNode;
}

/** Selects only presentation categories; assessed results may still have unresolved fit criteria. */
function matchesFilter(item: ResultItem, filter: OpportunityFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "assessed") {
    return item.assessed;
  }

  return item.kind === filter;
}

/** Filters server-rendered card slots locally so assessment evidence and account reads stay outside the client module graph. */
export function OpportunityResults({
  items,
  children,
}: {
  items: ResultItem[];
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<OpportunityFilter>("all");
  const visible = items.filter((item) => matchesFilter(item, filter));

  if (items.length === 0) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        className="dashboard-result-filters"
        role="group"
        aria-label="Filter opportunities"
      >
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            aria-controls="dashboard-result-list"
            onClick={() => setFilter(item.value)}
          >
            {item.label}
            <span>
              {
                items.filter((result) => matchesFilter(result, item.value))
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <p className="dashboard-results-count" role="status" aria-atomic="true">
        {visible.length}{" "}
        {visible.length === 1 ? "opportunity" : "opportunities"} shown
      </p>
      <div className="dashboard-result-list" id="dashboard-result-list">
        {visible.map((item) => (
          <div key={item.id}>{item.card}</div>
        ))}
        {visible.length === 0 && (
          <div className="dashboard-empty">
            <h3>No results in this category</h3>
            <p>
              Try another category to see more of your recent opportunities.
            </p>
            <button
              type="button"
              className="dashboard-text-button"
              onClick={() => setFilter("all")}
            >
              Show all results
            </button>
          </div>
        )}
      </div>
    </>
  );
}

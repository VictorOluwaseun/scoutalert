"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@repo/ui/components/icon";
import { Brand } from "../onboarding/components/brand";
import { previewScenarios, previewScouts } from "./fixtures";
import { usePreview } from "./preview-context";

export const previewRoot = "/preview/discovery";

/** Keeps sample disclosure and route navigation visible throughout the proposed discovery experience. */
export function PreviewShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { scenario, setScenario, saved, hidden, paused } = usePreview();
  const visibleSavedCount = saved.filter((id) => !hidden.includes(id)).length;

  return (
    <div className="discovery-preview">
      <a className="dp-skip" href="#discovery-main">
        Skip to content
      </a>
      <div className="dp-preview-bar">
        <div>
          <strong>Design preview</strong>
          <span>Fictional examples. Changes reset on refresh.</span>
        </div>
        <label className="dp-scenario">
          Preview state
          <span className="dp-select-wrap">
            <select
              value={scenario}
              onChange={(event) => {
                const selected = previewScenarios.find(
                  (item) => item.value === event.target.value,
                );

                if (selected) {
                  setScenario(selected.value);
                }
              }}
            >
              {previewScenarios.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={16} />
          </span>
        </label>
      </div>
      <div className="dp-workspace">
        <aside className="dp-rail">
          <Link
            className="dp-brand"
            href={previewRoot}
            aria-label="ScoutAlert preview home"
          >
            <Brand />
          </Link>
          <nav aria-label="Preview navigation" className="dp-nav">
            <Link
              href={previewRoot}
              aria-current={pathname === previewRoot ? "page" : undefined}
            >
              <Icon name="compass" size={21} />
              Discoveries
            </Link>
            <Link
              href={`${previewRoot}/saved`}
              aria-current={pathname.endsWith("/saved") ? "page" : undefined}
            >
              <Icon name="bookmark" size={21} />
              Saved<span className="dp-nav-count">{visibleSavedCount}</span>
            </Link>
            <Link
              className="dp-mobile-scouts"
              href={`${previewRoot}#preview-scouts`}
            >
              <Icon name="search" size={20} />
              Scouts
            </Link>
          </nav>
          <div className="dp-rail-scouts">
            <p>Your AI scouts</p>
            {previewScouts.map((scout) => (
              <Link
                key={scout.id}
                href={`${previewRoot}/scouts/${scout.id}`}
                aria-current={
                  pathname.endsWith(`/scouts/${scout.id}`) ? "page" : undefined
                }
              >
                <span
                  className={`dp-status-dot ${paused.includes(scout.id) ? "is-paused" : ""}`}
                />
                {scout.name}
              </Link>
            ))}
          </div>
          <div className="dp-rail-footer">
            <span className="dp-avatar">S</span>
            <div>
              <strong>Sample workspace</strong>
              <Link href="/dashboard">Return to your account</Link>
            </div>
          </div>
        </aside>
        <main className="dp-main" id="discovery-main">
          {children}
        </main>
      </div>
    </div>
  );
}

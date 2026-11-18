import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Brand } from "./components/brand";
import { RotatingHeadline } from "./components/rotating-headline";
import { ScoutIllustration } from "./components/scout-illustration";

/** Publishes the product introduction without requesting identity or starting discovery before beta activation. */
export function WebsitePreview() {
  return (
    <div className="scout-page">
      <a className="scout-skip-link" href="#scout-main">
        Skip to ScoutAlert
      </a>
      <header className="scout-header">
        <Link href="/" aria-label="ScoutAlert home">
          <Brand />
        </Link>
        <span className="scout-preview-badge">
          <span />
          Beta coming soon
        </span>
      </header>
      <main id="scout-main" className="scout-main scout-entry-layout">
        <section className="scout-main-content scout-goal-step">
          <RotatingHeadline />
          <p className="scout-lede">
            Tell it what you’re looking for. ScoutAlert searches for jobs,
            contracts, and client projects, checks the details, and alerts you
            when it finds something that fits.
          </p>
          <p className="scout-lede">
            We’re getting ready to welcome our first scouts. Sign-in, live
            searches, and email alerts aren’t available yet. Take a look around
            the example workspace while we prepare the beta.
          </p>
          <div className="scout-ready-actions">
            <Link className={buttonVariants()} href="/preview/discovery">
              Explore example workspace
              <Icon name="arrowRight" size={17} />
            </Link>
            <a className="scout-text-button" href="mailto:info@scoutalert.app">
              Contact us
            </a>
          </div>
          <p className="scout-subtle">
            The preview uses fictional opportunities. No account needed.
          </p>
        </section>
        <ScoutIllustration />
      </main>
      <footer className="scout-footer">
        <span>Jobs, contracts, and client projects. On your terms.</span>
        <span>ScoutAlert</span>
      </footer>
    </div>
  );
}

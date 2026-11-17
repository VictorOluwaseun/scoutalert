import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Brand } from "./components/brand";
import { RotatingHeadline } from "./components/rotating-headline";
import { ScoutIllustration } from "./components/scout-illustration";

/** Server-renders the public introduction; preview mode never offers account activation or live discovery. */
export function WebsitePreview({
  websiteOnly = true,
}: {
  websiteOnly?: boolean;
}) {
  return (
    <div className="scout-page">
      <a className="scout-skip-link" href="#scout-main">
        Skip to ScoutAlert
      </a>
      <header className="scout-header">
        <Link href="/" aria-label="ScoutAlert home">
          <Brand />
        </Link>
        {websiteOnly ? (
          <span className="scout-preview-badge">
            <span />
            Beta coming soon
          </span>
        ) : (
          <Link className="scout-text-button" href="/sign-in">
            Sign in
          </Link>
        )}
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
            {websiteOnly
              ? "We’re getting ready to welcome our first scouts. Sign-in, live searches, and email alerts aren’t available yet. Take a look around the example workspace while we prepare the beta."
              : "Describe the work you want, set your location and pay preferences, and choose how you hear about opportunities. Start by creating your scout’s brief."}
          </p>
          <div className="scout-ready-actions">
            <Link
              className={buttonVariants()}
              href={websiteOnly ? "/preview/discovery" : "/onboarding"}
            >
              {websiteOnly ? "Explore example workspace" : "Create your scout"}
              <Icon name="arrowRight" size={17} />
            </Link>
            <a className="scout-text-button" href="mailto:info@scoutalert.app">
              Contact us
            </a>
          </div>
          <p className="scout-subtle">
            {websiteOnly
              ? "The preview uses fictional opportunities. No account needed."
              : "You can review your brief before activating your scout."}
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

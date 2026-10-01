import { Icon } from "@repo/ui/components/icon";

/** Illustrates how a personal brief can lead to different kinds of opportunity; all content is illustrative. */
export function ScoutIllustration() {
  return (
    <div
      className="scout-illustration"
      role="img"
      aria-label="Illustration: an example remote design brief connects to an example job and an example client project"
    >
      <div className="scout-illustration-heading" aria-hidden="true">
        <span className="scout-illustration-symbol">
          <Icon name="compass" size={21} />
        </span>
        <span>How a scout could work</span>
      </div>

      <div className="scout-illustration-flow" aria-hidden="true">
        <div className="scout-illustration-brief">
          <span>Example brief</span>
          <strong>Design work I can do remotely.</strong>
          <span>Jobs and client projects</span>
        </div>

        <div className="scout-illustration-connection">
          <span>
            <Icon name="arrowRight" size={18} />
          </span>
        </div>

        <div className="scout-illustration-opportunities">
          <div className="scout-illustration-opportunity">
            <span className="scout-illustration-type">
              <Icon name="briefcase" size={15} /> Example job
            </span>
            <strong>Product designer</strong>
            <span>Remote · Full-time</span>
          </div>
          <div className="scout-illustration-opportunity">
            <span className="scout-illustration-type">
              <Icon name="sparkles" size={15} /> Example client project
            </span>
            <strong>Brand identity project</strong>
            <span>Remote · Project work</span>
          </div>
        </div>
      </div>

      <p className="scout-illustration-note" aria-hidden="true">
        Examples only. These are not matches to your draft.
      </p>
    </div>
  );
}

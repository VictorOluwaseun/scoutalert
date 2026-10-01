import { Icon } from "@repo/ui/components/icon";
import type { ScoutDraft } from "../types";
import { arrangementLabels, categoryLabels, opportunities } from "../fixtures";

/** A live view of entered preferences; it does not imply that a search has been run. */
export function ScoutSummary({ draft }: { draft: ScoutDraft }) {
  const example = opportunities.find(
    (item) => item.category === draft.category,
  );

  return (
    <aside className="scout-side-stack" aria-label="Your scout preview">
      <div className="scout-side-note">
        <div className="scout-small-compass">
          <Icon name="compass" size={20} />
        </div>
        <span className="scout-note-label">Your draft brief</span>
        <h2>{draft.target || "Your next opportunity"}</h2>
        <div className="scout-side-facts">
          <span>
            <Icon name="briefcase" size={17} />
            {categoryLabels[draft.category]}
          </span>
          <span>
            <Icon name="laptop" size={17} />
            {arrangementLabels[draft.arrangement]}
          </span>
          <span>
            <Icon name="map" size={17} />
            {draft.residence || "Location is yours to decide"}
          </span>
        </div>
      </div>
      {example && (
        <article className="scout-side-example">
          <span>Example opportunity · not matched to you</span>
          <div className="scout-side-example-content">
            <span
              className={`scout-company-avatar scout-avatar-${example.color}`}
            >
              {example.initial}
            </span>
            <div>
              <strong>{example.title}</strong>
              <span>{example.company}</span>
            </div>
          </div>
          <p>{example.pay}</p>
          <small>{example.eligibility}.</small>
        </article>
      )}
    </aside>
  );
}

/** Illustrates a notification layout with conspicuous sample labeling and no send action. */
export function DigestPreview({ draft }: { draft: ScoutDraft }) {
  const examples = opportunities.filter(
    (item) => item.category === draft.category,
  );
  return (
    <aside className="scout-digest-preview">
      <div className="scout-digest-label">
        <Icon name="mail" size={17} />A peek at your roundup<span>Example</span>
      </div>
      <div className="scout-digest-paper">
        <span className="scout-digest-brand">ScoutAlert.</span>
        <h2>
          A few things
          <br />
          worth your attention.
        </h2>
        <p>Here’s how your scout’s finds could look.</p>
        {examples.map((item) => (
          <div className="scout-digest-item" key={item.id}>
            <span className={`scout-company-avatar scout-avatar-${item.color}`}>
              {item.initial}
            </span>
            <div>
              <strong>{item.title}</strong>
              <span>{item.pay}</span>
            </div>
          </div>
        ))}
        <div className="scout-digest-foot">
          Example layout. No fit has been assessed.
        </div>
      </div>
      <p className="scout-subtle">
        Illustrative content, not matched opportunities. Your saved scout uses
        your confirmed alert choices.
      </p>
    </aside>
  );
}

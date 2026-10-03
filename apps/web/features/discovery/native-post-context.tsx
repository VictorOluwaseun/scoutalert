import type { WebDiscoveryLead } from "./discovery-contracts";
import { discoveryTimestamp } from "./discovery-presentation";

const relationLabels = {
  replied_to: "Post being replied to",
  quoted: "Quoted post",
  retweeted: "Reposted post",
  conversation: "Conversation starter",
};

/** Shows bounded, separately attributed source context without presenting it as the original author's statement. */
export function NativePostContext({ lead }: { lead: WebDiscoveryLead }) {
  if (!lead.nativePost) {
    return null;
  }
  const context = lead.nativeContext;
  const hasReferences =
    lead.nativePost.references.length > 0 ||
    !lead.nativePost.editIds.includes(lead.nativePost.conversationId);
  if (!context && !hasReferences) {
    return null;
  }
  if (!context) {
    return (
      <p>
        Related posts have not been checked yet. This lead needs more context
        before personal matching.
      </p>
    );
  }
  return (
    <section className="web-lead-context">
      <h4>Related posts</h4>
      <p>
        {context.complete
          ? "The referenced posts in this context check were captured. This does not include every reply in the conversation."
          : "Some context is missing or incomplete. This lead needs more investigation before personal matching."}
      </p>
      {context.posts.map((post) => (
        <div key={post.id}>
          <p>
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              {relationLabels[post.relation]}
            </a>
            {" · "}
            {post.authorId === lead.nativePost!.authorId
              ? "Same author"
              : "Another author"}
          </p>
          <blockquote>{post.text}</blockquote>
          <p>Checked {discoveryTimestamp(post.checkedAt)}</p>
        </div>
      ))}
      {context.missingIds.length > 0 && (
        <p>
          {context.missingIds.length} referenced{" "}
          {context.missingIds.length === 1 ? "post" : "posts"} could not be
          captured.
        </p>
      )}
      {context.bounded && (
        <p>
          This check reached its context limit. Some content remains unreviewed.
        </p>
      )}
    </section>
  );
}

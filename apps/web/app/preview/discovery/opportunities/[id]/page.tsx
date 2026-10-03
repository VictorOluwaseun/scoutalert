import { notFound } from "next/navigation";
import { previewOpportunities } from "@/features/discovery-preview/fixtures";
import { OpportunityDetail } from "@/features/discovery-preview/opportunity-detail";

/** Resolves only known fictional opportunities and returns 404 for unknown preview identifiers. */
export default async function OpportunityPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = previewOpportunities.find((item) => item.id === id);

  if (!opportunity) {
    notFound();
  }

  return <OpportunityDetail opportunity={opportunity} />;
}

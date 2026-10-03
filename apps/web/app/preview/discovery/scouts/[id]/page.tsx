import { notFound } from "next/navigation";
import { previewScouts } from "@/features/discovery-preview/fixtures";
import { ScoutDetail } from "@/features/discovery-preview/scout-detail";

/** Resolves a fictional scout from a URL so deep links and browser history behave normally. */
export default async function ScoutPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scout = previewScouts.find((item) => item.id === id);

  if (!scout) {
    notFound();
  }

  return <ScoutDetail scout={scout} />;
}

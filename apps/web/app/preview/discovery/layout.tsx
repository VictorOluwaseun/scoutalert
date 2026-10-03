import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PreviewProvider } from "@/features/discovery-preview/preview-context";
import { PreviewShell } from "@/features/discovery-preview/preview-shell";
import "@/features/discovery-preview/discovery-preview.css";

export const metadata: Metadata = {
  title: "Discovery design preview · ScoutAlert",
  robots: { index: false, follow: false },
};

/** Isolates fictional UI review routes and their temporary state from authenticated account pages. */
export default function DiscoveryPreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PreviewProvider>
      <PreviewShell>{children}</PreviewShell>
    </PreviewProvider>
  );
}

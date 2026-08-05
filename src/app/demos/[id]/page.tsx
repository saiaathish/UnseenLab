import type { Metadata } from "next";

import { DemonstrationPage } from "@/components/demonstrations/demonstration-page";

export const metadata: Metadata = {
  title: "Demonstration",
};

/**
 * Demo route. The session itself lives on the client (demoStore): this page
 * only resolves the id and hands it to the client page, which falls back to
 * the device copy or redirects home when no session exists.
 */
export default async function DemoRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DemonstrationPage demoId={id} />;
}

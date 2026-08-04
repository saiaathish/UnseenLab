import type { Metadata } from "next";
import Link from "next/link";
import { ResearchSession } from "@/components/research/research-session";

export const metadata: Metadata = {
  title: "Product research session — UnseenLab",
};

/**
 * Facilitator-only research entry point. Deliberately plain: no header, no
 * lab navigation, reachable only through a subtle footer link. The client
 * component owns consent, measures, notes, export, and cleanup — all local.
 */
export default function ResearchPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background text-foreground"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Home
        </Link>
        <ResearchSession />
      </div>
    </main>
  );
}

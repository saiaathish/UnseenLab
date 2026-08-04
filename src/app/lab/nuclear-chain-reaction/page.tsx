"use client";

import { AppHeader } from "@/components/navigation/app-header";
import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";
import { ExperimentShell } from "@/components/lab/experiment-shell";

export default function NuclearChainReactionLabPage() {
  return (
    <div className="pt-[4.5rem]">
      <AppHeader />
      <ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />
    </div>
  );
}

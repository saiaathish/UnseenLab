"use client";

import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";
import { ExperimentShell } from "@/components/lab/experiment-shell";

export default function NuclearChainReactionLabPage() {
  return <ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />;
}

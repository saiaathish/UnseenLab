"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  NUCLEAR_CHAIN_REACTION_EXPERIMENT,
  PLANNED_EXPERIMENTS,
  simulationDisclaimer,
} from "@/domain/experiments";

/**
 * Available lab + future labs (copy spec §5.6). One real lab, honestly
 * labeled; planned labs are rows with no start action and no dates.
 */

export function AvailableLabCard() {
  const lab = NUCLEAR_CHAIN_REACTION_EXPERIMENT;

  return (
    <div className="space-y-8">
      <section aria-labelledby="available-lab-heading" className="space-y-3">
        <h2
          id="available-lab-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Available lab
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{lab.title}</h3>
              <Badge>Interactive lab ready</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {lab.pitch}
            </p>
            <div>
              <Link href={`/lab/${lab.slug}`} className={buttonVariants()}>
                Start the Nuclear Chain Reaction lab
              </Link>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {simulationDisclaimer}
            </p>
          </CardContent>
        </Card>
      </section>

      <section
        aria-labelledby="future-labs-heading"
        className="space-y-3 rounded-xl border border-dashed border-border p-4"
      >
        <h2
          id="future-labs-heading"
          className="text-base font-semibold tracking-tight text-muted-foreground"
        >
          Future labs
        </h2>
        <ul className="space-y-1.5 text-sm leading-6 text-muted-foreground">
          {PLANNED_EXPERIMENTS.map((experiment) => (
            <li key={experiment.id}>
              {experiment.title} — planned
            </li>
          ))}
        </ul>
        <p className="text-xs leading-5 text-muted-foreground">
          These labs are in development. You&apos;ll see them here when
          they&apos;re ready.
        </p>
      </section>
    </div>
  );
}

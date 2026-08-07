"use client";

import { BadgeCheck, Lightbulb, PlayCircle } from "lucide-react";

import { TRUST_LABELS, type TrustLevel } from "@/demonstrations/spec/demo-spec";
import { cn } from "@/lib/utils";

/**
 * Trust badge: shows the spec.s declared trust level using the exact
 * TRUST_LABELS wording (never paraphrased, never stronger than the spec
 * claims). Color + icon per level; the aria-label includes the level name so
 * screen readers hear the same label sighted learners see.
 *
 * Contrast: every text/icon color sits on its own /10 tint (all ≥ 4.5:1 per
 * the platform a11y audit), not on a shared muted background.
 */

const TRUST_BADGE_STYLES: Record<
  TrustLevel,
  { classes: string; Icon: typeof BadgeCheck; iconLabel: string }
> = {
  verified_simulation: {
    classes:
      "border-[#15803d]/30 bg-[#15803d]/10 text-[#15803d] dark:text-[#4ade80] dark:border-[#4ade80]/30 dark:bg-[#4ade80]/10",
    Icon: BadgeCheck,
    iconLabel: "Verified simulation check",
  },
  conceptual_demonstration: {
    classes:
      "border-[#175cd3]/30 bg-[#175cd3]/10 text-[#175cd3] dark:text-[#93c5fd] dark:border-[#93c5fd]/30 dark:bg-[#93c5fd]/10",
    Icon: Lightbulb,
    iconLabel: "Conceptual demonstration idea",
  },
  explanatory_animation: {
    classes:
      "border-[#92400e]/30 bg-[#92400e]/10 text-[#92400e] dark:text-[#fcd34d] dark:border-[#fcd34d]/30 dark:bg-[#fcd34d]/10",
    Icon: PlayCircle,
    iconLabel: "Explanatory animation play",
  },
};

export function TrustBadge({
  level,
  className,
}: {
  level: TrustLevel;
  className?: string;
}) {
  const { classes, Icon, iconLabel } = TRUST_BADGE_STYLES[level];
  return (
    <span
      aria-label={`Trust: ${TRUST_LABELS[level]}`}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
        classes,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span aria-hidden="true">{TRUST_LABELS[level]}</span>
      <span className="sr-only">{iconLabel}</span>
    </span>
  );
}

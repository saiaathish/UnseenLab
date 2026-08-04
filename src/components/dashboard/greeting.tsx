"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Time-of-day greeting (copy spec §5.1). The time of day is computed AFTER
 * mount so the client and server never disagree about the heading text
 * (hydration safety). Before mount a skeleton placeholder renders instead.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening";

/** 05:00–11:59 morning, 12:00–16:59 afternoon, 17:00–04:59 evening. */
export function greetingForHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

export const GREETING_WORDS: Record<TimeOfDay, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/** First name from the display name, falling back to the email local part. */
export function firstNameFor(
  displayName: string | null,
  email: string | null,
): string | null {
  const fromName = displayName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const fromEmail = email?.split("@")[0]?.trim();
  return fromEmail || null;
}

export function Greeting({
  displayName,
  email,
}: {
  displayName: string | null;
  email: string | null;
}) {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);

  useEffect(() => {
    // Deferred so the time-dependent text never mismatches the server render.
    const timer = window.setTimeout(() => {
      setTimeOfDay(greetingForHour(new Date().getHours()));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!timeOfDay) {
    return (
      <Skeleton
        data-testid="greeting-skeleton"
        className="h-9 w-72 max-w-full"
      />
    );
  }

  const name = firstNameFor(displayName, email);
  const text = name
    ? `${GREETING_WORDS[timeOfDay]}, ${name}.`
    : `${GREETING_WORDS[timeOfDay]}.`;

  return (
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
      {text}
    </h1>
  );
}

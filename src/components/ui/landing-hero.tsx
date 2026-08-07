"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { AskDemoForm } from "@/components/demonstrations/ask-demo-form";

const HeroWaveBackground = dynamic(
  () =>
    import("@/components/ui/hero-wave-background").then(
      (m) => m.HeroWaveBackground,
    ),
  { ssr: false },
);

const subscribeNoop = () => () => {};
const isClientSnapshot = () => true;
const isServerSnapshot = () => false;

/**
 * The landing hero: the original full-viewport wave-background hero, now
 * hosting the generative ask-to-demonstration flow.
 *
 * One input, one product: the legacy routeTopic() nuclear router is gone;
 * AskDemoForm is the single entrance to the generative pipeline (spec /
 * clarify / unsafe / unsupported / offline fallback). The wave background is
 * decorative and always degrades to a static gradient (aria-hidden,
 * pointer-events-none, reduced-motion aware).
 */
export function LandingHero() {
  // Hydration-safe: render the animated background only on the client.
  const isMounted = useSyncExternalStore(
    subscribeNoop,
    isClientSnapshot,
    isServerSnapshot,
  );

  return (
    <section
      aria-label="Ask for a demonstration"
      className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#070b14] text-white"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {isMounted ? <HeroWaveBackground /> : null}
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            What topic do you need help with?
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
            Type any STEM concept — like “What does Newton’s second law say?” —
            and we’ll build an interactive learning experience you can enter,
            step by step.
          </p>

          <div className="mt-8 w-full max-w-2xl text-left">
            <AskDemoForm />
          </div>

          {/* HOME-04 (copy spec §2.1a): muted account-value line, quieter than
              the primary action. Opens the auth dialog via /?auth=open, which
              AppHeader's SignInDialog picks up. */}
          <Link
            href="/?auth=open"
            className="mt-4 inline-block rounded text-sm text-gray-400/80 transition-colors hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
          >
            Sign in to save preferences and continue across devices.
          </Link>
        </div>
      </div>
    </section>
  );
}

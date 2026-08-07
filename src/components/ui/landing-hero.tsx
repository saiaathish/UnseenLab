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
 * The original immersive landing composition, backed by the new generative
 * pipeline. The visual treatment intentionally mirrors the pre-generative
 * hero while AskDemoForm remains the single functional entrance.
 */
export function LandingHero() {
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
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-28 text-center sm:pt-24">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            What topic do you need help with?
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
            Describe the idea that feels unclear. We’ll guide you to the closest
            interactive learning experience.
          </p>

          <div className="mt-8 w-full max-w-xl text-left">
            <AskDemoForm />
          </div>

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

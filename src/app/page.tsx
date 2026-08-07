import Link from "next/link";
import { AppHeader } from "@/components/navigation/app-header";
import { AskDemoSection } from "@/components/demonstrations/ask-demo-form";
import { isGenerativeDemosEnabled } from "@/demonstrations/feature-flag";
import { simulationDisclaimer } from "@/domain/experiments";

const steps = [
  {
    number: "1",
    title: "Describe",
    body: "Tell us which idea feels unclear.",
  },
  {
    number: "2",
    title: "Experiment",
    body: "Change one variable and watch what happens.",
  },
  {
    number: "3",
    title: "Understand",
    body: "Compare your prediction with the result.",
  },
];

export default function Home() {
  const generativeDemosEnabled = isGenerativeDemosEnabled();

  return (
    <main id="main-content" className="bg-[#070b14] text-white">
      <AppHeader />
      {generativeDemosEnabled ? (
        <AskDemoSection />
      ) : (
        <section
          aria-label="Welcome"
          className="flex min-h-[60svh] flex-col items-center justify-center px-4 py-20 text-center"
        >
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Adaptive interactive STEM learning
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
            Explore honest, deterministic interactive models at your own pace.
          </p>
        </section>
      )}
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="scroll-mt-24 py-20"
        >
          <h2
            id="how-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            How it works
          </h2>
          <ol className="mt-8 grid gap-10 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number}>
                {/* The <ol> already announces the step numbers; the circle
                    badge is a visual duplicate, so it stays aria-hidden. */}
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-teal-400/40 text-sm font-semibold text-teal-300"
                >
                  {step.number}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-base leading-7 text-gray-400">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="accessibility"
          aria-labelledby="accessibility-heading"
          className="scroll-mt-24 border-t border-white/10 py-20"
        >
          <h2
            id="accessibility-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Accessibility
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-gray-400">
            No timer. No diagnosis-based presets. Reduced motion, adjustable
            pacing, keyboard access, and learner-controlled adaptations.
          </p>
        </section>

        <footer className="border-t border-white/10 py-8 text-xs leading-5 text-gray-400">
          <p>{simulationDisclaimer}</p>
          <p className="mt-3">
            <Link
              href="/research"
              className="text-gray-500 underline decoration-white/20 underline-offset-2 transition-colors hover:text-gray-300"
            >
              Product research session
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}

import Link from "next/link";
import { TopicInputHero } from "@/components/ui/topic-input-hero";
import {
  NUCLEAR_CHAIN_REACTION_EXPERIMENT,
  PLANNED_EXPERIMENTS,
  simulationDisclaimer,
} from "@/domain/experiments";

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
  return (
    <main id="main-content" className="bg-[#070b14] text-white">
      <TopicInputHero />
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="py-20"
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
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-teal-400/40 text-sm font-semibold text-teal-300">
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
          id="available-lab"
          aria-labelledby="available-heading"
          className="border-t border-white/10 py-20"
        >
          <h2
            id="available-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Available lab
          </h2>
          <div className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-8">
            <h3 className="text-xl font-semibold">
              {NUCLEAR_CHAIN_REACTION_EXPERIMENT.title}
            </h3>
            <p className="mt-3 text-base leading-7 text-gray-400">
              {NUCLEAR_CHAIN_REACTION_EXPERIMENT.pitch}
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-teal-300">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-teal-400"
              />
              Interactive lab ready
            </p>
            <div className="mt-6">
              <Link
                href="/lab/nuclear-chain-reaction"
                className="inline-block rounded-xl bg-teal-500 px-6 py-3 text-base font-semibold text-[#070b14] transition-colors hover:bg-teal-400"
              >
                Start this lab
              </Link>
            </div>
            <p className="mt-6 text-xs leading-5 text-gray-400">
              A conceptual, simplified, and fictionalized model — not a real
              reactor.
            </p>
          </div>

          <details className="mt-6 max-w-2xl">
            <summary className="cursor-pointer text-sm font-medium text-gray-400">
              Future labs
            </summary>
            <ul className="mt-3 space-y-1.5 text-sm leading-6 text-gray-400">
              {PLANNED_EXPERIMENTS.map((experiment) => (
                <li key={experiment.id}>{experiment.title} — planned</li>
              ))}
            </ul>
          </details>
        </section>

        <section
          id="accessibility"
          aria-labelledby="accessibility-heading"
          className="border-t border-white/10 py-20"
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
          {simulationDisclaimer}
        </footer>
      </div>
    </main>
  );
}

import Link from "next/link";
import {
  NUCLEAR_CHAIN_REACTION_EXPERIMENT,
  PLANNED_EXPERIMENTS,
  simulationDisclaimer,
} from "@/domain/experiments";

const steps = [
  {
    number: "1",
    title: "Predict",
    body: "Choose what you think will happen. There is no penalty for being wrong.",
  },
  {
    number: "2",
    title: "Experiment",
    body: "Change one variable and watch the system respond through animation.",
  },
  {
    number: "3",
    title: "Understand",
    body: "Compare the result with your prediction and try a clearer view.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">UnseenLab</h1>
            <p className="text-sm text-muted">Adaptive virtual STEM labs</p>
          </div>
          <p className="hidden text-sm text-muted sm:block">
            No account · No timer · You control the pace
          </p>
        </header>

        <section className="grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Learn by changing what you cannot safely touch.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
              Run an interactive STEM experiment, make a prediction, and see
              cause and effect through animation—one clear step at a time.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/lab/nuclear-chain-reaction"
                className="rounded-xl bg-accent-strong px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:brightness-105"
              >
                Start the experiment
              </Link>
              <span className="text-sm text-muted">
                About 5 minutes · Works without an API key
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm font-semibold text-accent">Available now</p>
            <h3 className="mt-2 text-2xl font-semibold">
              {NUCLEAR_CHAIN_REACTION_EXPERIMENT.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              Watch a conceptual chain reaction change as you adjust one
              variable. The model is simplified and uses no real-world reactor
              values.
            </p>
            <div className="mt-5 rounded-2xl bg-surface-raised p-4">
              <p className="text-sm font-medium">Best first experience</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                Animation first, one-variable mode, and feedback only after the
                trial.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="how-heading" className="border-y border-border py-10">
          <h2 id="how-heading" className="text-2xl font-semibold">
            Three steps. No dashboard to learn.
          </h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-strong font-bold text-white">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <h2 className="text-2xl font-semibold">Designed with learner control</h2>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              The first design participant is a neurodivergent high-school
              physics learner who asked for more interactivity and animation.
              UnseenLab does not use diagnosis presets. Every pacing,
              representation, and display choice remains under the learner’s
              control.
            </p>
          </div>

          <details className="rounded-2xl border border-border bg-surface">
            <summary className="cursor-pointer px-5 py-4 font-semibold">
              Future experiments
            </summary>
            <ul className="border-t border-border px-5 py-4 text-sm leading-7 text-muted">
              {PLANNED_EXPERIMENTS.map((experiment) => (
                <li key={experiment.id}>{experiment.title} — planned</li>
              ))}
            </ul>
          </details>
        </section>

        <footer className="border-t border-border py-6 text-xs leading-5 text-muted">
          {simulationDisclaimer}
        </footer>
      </div>
    </main>
  );
}

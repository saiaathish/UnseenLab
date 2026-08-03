import Link from "next/link";
import {
  NUCLEAR_CHAIN_REACTION_EXPERIMENT,
  PLANNED_EXPERIMENTS,
  simulationDisclaimer,
} from "@/domain/experiments";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="w-full max-w-5xl">
        <header className="flex flex-col items-start gap-4">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">
            Adaptive Virtual STEM Laboratory
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            UnseenLab
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted">
            UnseenLab lets students safely perform otherwise inaccessible STEM
            experiments — dangerous, radioactive, microscopic, massive, or too
            slow for a classroom — while an adaptive engine changes how each
            experiment is represented, paced, and controlled according to the
            learner&apos;s demonstrated understanding.
          </p>
          <Link
            href="/lab/nuclear-chain-reaction"
            className="mt-2 rounded-lg bg-accent-strong px-6 py-3 text-base font-semibold text-white hover:brightness-110"
          >
            Enter the lab
          </Link>
        </header>

        <section aria-labelledby="labs-heading" className="mt-14">
          <h2 id="labs-heading" className="text-xl font-semibold">
            Laboratories
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-accent/40 bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                Available now
              </p>
              <h3 className="mt-2 text-lg font-semibold">
                {NUCLEAR_CHAIN_REACTION_EXPERIMENT.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {NUCLEAR_CHAIN_REACTION_EXPERIMENT.pitch}
              </p>
              <Link
                href="/lab/nuclear-chain-reaction"
                className="mt-4 inline-block rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Enter this lab
              </Link>
            </div>

            {PLANNED_EXPERIMENTS.map((experiment) => (
              <div
                key={experiment.id}
                aria-disabled="true"
                className="rounded-xl border border-border bg-surface p-5 opacity-70"
              >
                <p className="text-xs font-medium uppercase tracking-widest text-muted">
                  Planned
                </p>
                <h3 className="mt-2 text-lg font-semibold">
                  {experiment.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {experiment.pitch}
                </p>
                <p className="mt-4 inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
                  Not built yet
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="adapt-heading" className="mt-14">
          <h2 id="adapt-heading" className="text-xl font-semibold">
            How UnseenLab adapts to you
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Predict before you run",
                body: "Every trial starts with your prediction and your confidence. The lab records it, without judgment.",
              },
              {
                title: "Adaptations you control",
                body: "When the lab notices possible friction, it offers a change — a slower animation, a graph, one-variable mode. You accept, reject, or modify it.",
              },
              {
                title: "Counterfactual Microscope",
                body: "Change exactly one variable and see the same experiment side by side, so cause and effect stay clear.",
              },
              {
                title: "Adaptation Replay",
                body: "After a trial sequence, review your predictions, the changes offered, and what the evidence suggests about your understanding.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="evidence-heading" className="mt-14">
          <h2 id="evidence-heading" className="text-xl font-semibold">
            Design evidence
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            <li className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-semibold">Designed with</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                1 initial design participant — a high-school senior in AP
                Physics 2 who reports learning differently and values
                interactivity and animation.
              </p>
            </li>
            <li className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-semibold">Initial need</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Existing demonstrations and lab examples did not provide enough
                interactivity to build a full understanding.
              </p>
            </li>
            <li className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-semibold">First structured test session</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Pending — results will be recorded here honestly, including
                friction and requested changes.
              </p>
            </li>
            <li className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-semibold">Evidence fields to fill</h3>
              <ol className="mt-1 list-inside list-decimal text-sm leading-6 text-muted">
                <li>Observed issue: pending</li>
                <li>Product change: pending</li>
                <li>
                  Initial result: pending (baseline vs post-use scores,
                  confidence, mental effort)
                </li>
              </ol>
            </li>
          </ul>
        </section>

        <footer className="mt-14 border-t border-border pt-6 text-sm leading-6 text-muted">
          <p>{simulationDisclaimer}</p>
          <p className="mt-2">
            Designed with an initial design participant (a high-school senior
            who reports learning differently and values interactivity and
            animation). No diagnosis-based presets — every setting is an
            explicit learner choice. No account, no tracking, everything stays
            on this device.
          </p>
        </footer>
      </div>
    </main>
  );
}

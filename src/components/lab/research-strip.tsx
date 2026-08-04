"use client";

/**
 * Small footer strip shown inside the lab only while research recording is
 * active (consent agreed + `?research=1`). Renders nothing otherwise, so
 * ordinary learners never see it.
 */
export function ResearchStrip() {
  return (
    <footer
      aria-label="Research recording status"
      className="border-t border-accent/40 bg-accent-soft px-4 py-2 text-center"
    >
      <p className="text-xs font-semibold text-accent-strong">
        Research recording ON — this session is being recorded locally for
        product testing.
      </p>
    </footer>
  );
}

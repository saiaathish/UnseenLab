"use client";

import { useState } from "react";

const SECTION_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#available-lab", label: "Available lab" },
  { href: "#accessibility", label: "Accessibility" },
] as const;

const MOBILE_PANEL_ID = "mini-navbar-mobile-panel";

export function MiniNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="fixed top-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 sm:w-auto">
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-2 shadow-lg shadow-black/10 backdrop-blur-md sm:px-3">
        <span className="px-1.5 text-sm font-semibold tracking-tight text-white/90 sm:px-2">
          Unseen<span className="text-teal-300">Lab</span>
        </span>

        <span
          aria-hidden="true"
          className="mx-1 hidden h-4 w-px bg-white/15 sm:block"
        />

        <nav
          aria-label="Homepage sections"
          className="hidden items-center gap-1 sm:flex"
        >
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls={MOBILE_PANEL_ID}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
        >
          {menuOpen ? (
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      <div
        id={MOBILE_PANEL_ID}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out sm:hidden ${
          menuOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav
          aria-label="Homepage sections"
          className="mt-2 flex flex-col gap-1 rounded-2xl border border-white/15 bg-white/10 p-2 backdrop-blur-md"
        >
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { UserMenu } from "@/components/auth/user-menu";
import { useSession } from "@/lib/supabase/use-session";

const MOBILE_PANEL_ID = "app-header-mobile-panel";

/**
 * Application header (replaces MiniNavbar). Fixed glass pill, dark identity,
 * auth-aware: signed-out visitors get "Sign in" (opens the sign-in dialog);
 * signed-in learners get the avatar menu. The single SignInDialog instance
 * lives here so `/?auth=open` works on every page.
 */
export function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const { user, loading } = useSession();

  const signedIn = !loading && user !== null;

  // The lab (and other in-page surfaces) can open the dialog without leaving
  // the page by dispatching `unseenlab:open-auth`.
  useEffect(() => {
    const handler = () => setAuthOpen(true);
    window.addEventListener("unseenlab:open-auth", handler);
    return () => window.removeEventListener("unseenlab:open-auth", handler);
  }, []);

  const links = signedIn
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/lab/nuclear-chain-reaction", label: "Lab" },
      ]
    : [
        { href: "/#how-it-works", label: "How it works" },
        { href: "/#available-lab", label: "Available lab" },
        { href: "/#accessibility", label: "Accessibility" },
      ];

  return (
    <div className="fixed top-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 sm:w-auto">
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-[#0b1220]/95 px-2.5 py-2 shadow-lg shadow-black/20 backdrop-blur-md sm:px-3">
        <Link
          href="/"
          className="rounded-full px-1.5 text-sm font-semibold tracking-tight text-white/90 hover:text-white sm:px-2"
        >
          Unseen<span className="text-teal-300">Lab</span>
        </Link>

        <span
          aria-hidden="true"
          className="mx-1 hidden h-4 w-px bg-white/15 sm:block"
        />

        <nav
          aria-label={signedIn ? "Learner navigation" : "Homepage sections"}
          className="hidden items-center gap-1 sm:flex"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-white/15 sm:block" />

        <div className="px-1">
          {signedIn ? (
            <UserMenu user={user} />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-white/90 hover:bg-white/10 hover:text-white"
              onClick={() => setAuthOpen(true)}
            >
              Sign in
            </Button>
          )}
        </div>

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
          menuOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav
          aria-label={signedIn ? "Learner navigation" : "Homepage sections"}
          className="mt-2 flex flex-col gap-1 rounded-2xl border border-white/15 bg-[#0b1220]/95 p-2 backdrop-blur-md"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          {!signedIn && (
            <Button
              type="button"
              variant="ghost"
              className="justify-start rounded-xl px-3 py-2.5 text-white/90 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setMenuOpen(false);
                setAuthOpen(true);
              }}
            >
              Sign in
            </Button>
          )}
        </nav>
      </div>

      {/* Single dialog instance; wrapped in Suspense because it reads
          useSearchParams and pages using it may be statically rendered. */}
      <Suspense fallback={null}>
        <SignInDialog open={authOpen} onOpenChange={setAuthOpen} />
      </Suspense>
    </div>
  );
}

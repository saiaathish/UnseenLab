"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, LayoutDashboard } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignOutDialog } from "@/components/auth/sign-out-dialog";

function initialsFor(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined;
  if (name && name.trim().length > 0) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return (user.email ?? "U").slice(0, 1).toUpperCase();
}

function firstNameFor(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined;
  if (name && name.trim().length > 0) {
    return name.trim().split(/\s+/)[0] ?? "";
  }
  return (user.email ?? "").split("@")[0] ?? "";
}

/** Signed-in avatar menu (copy spec §2.2, AUTH-11/12). */
export function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const displayName = firstNameFor(user);
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu for ${displayName || "UnseenLab learner"}`}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <Avatar>
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback>{initialsFor(user)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* Plain div: the shared DropdownMenuLabel wrapper (GroupLabel)
              requires a Menu.Group parent in base-ui 1.6 and crashes the
              popup on open, so the header label is rendered directly with
              the same classes and copy. */}
          <div
            data-slot="dropdown-menu-label"
            className="px-1.5 py-1 text-xs font-medium text-muted-foreground"
          >
            <span className="block text-sm font-medium text-foreground">
              {displayName || "Learner"}
            </span>
            <span className="block text-xs text-muted-foreground">{user.email}</span>
          </div>
          <DropdownMenuSeparator />
          {/* Items use onClick (not onSelect): base-ui 1.6 Menu.Item never
              invokes onSelect — onClick is composed with its internal
              close-on-click, so the menu still closes after each item. */}
          <DropdownMenuItem onClick={() => router.push("/dashboard")}>
            <LayoutDashboard aria-hidden="true" />
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings aria-hidden="true" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Sign out asks first: local evidence may belong to a shared device
              (PRIV-01). The dialog's default keeps it; the menu closes on
              click via base-ui's closeOnClick. */}
          <DropdownMenuItem onClick={() => setSignOutOpen(true)}>
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  );
}

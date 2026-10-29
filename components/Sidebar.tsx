"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell, Briefcase, CalendarDays, CheckSquare, ChevronDown, ChevronRight, DoorOpen, FileText,
  LayoutGrid, LogOut, Mail, Megaphone, Menu, Mic2, Receipt, Settings, Tag, Users, X,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { initials } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Theme } from "@/lib/theme";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
const ALL_GROUPS: { title: string; items: Item[]; collapsible?: boolean }[] = [
  { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutGrid }] },
  {
    title: "Clients",
    collapsible: true,
    items: [
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/artists", label: "Artists / Bands", icon: Mic2 },
    ],
  },
  {
    title: "Studio",
    collapsible: true,
    items: [
      { href: "/bookings", label: "Bookings", icon: CalendarDays },
      { href: "/projects", label: "Projects", icon: Briefcase },
      { href: "/tasks", label: "To-Dos", icon: CheckSquare },
      { href: "/events", label: "Events & Closed Days", icon: Megaphone },
    ],
  },
  {
    title: "Money",
    collapsible: true,
    items: [
      { href: "/quotes", label: "Quotes", icon: FileText },
      { href: "/invoices", label: "Invoices", icon: Receipt },
    ],
  },
  {
    title: "Setup",
    collapsible: true,
    items: [
      { href: "/admin/rooms", label: "Studios / Rooms", icon: DoorOpen },
      { href: "/admin/services", label: "Price List", icon: Tag },
      { href: "/admin/emails", label: "Client Emails", icon: Mail },
      { href: "/admin/team", label: "Team", icon: Users },
      { href: "/settings", label: "Studio Settings", icon: Settings },
    ],
  },
];

// Money pages are for owners and admins only (the pages check this too).
const MONEY_PAGES = ["/quotes", "/invoices"];

export function Sidebar({ studio, logo, user, unread, theme }: { studio: string; logo?: string | null; user: { name: string; role: string }; unread: number; theme: Theme }) {
  const path = usePathname();
  const seesMoney = user.role === "OWNER" || user.role === "ADMIN";
  const GROUPS = seesMoney ? ALL_GROUPS : ALL_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !MONEY_PAGES.includes(i.href)) })).filter((g) => g.items.length);
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  // The most specific match wins.
  const current = GROUPS.flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3.5 pb-4">
      {GROUPS.map((g) => {
        const isClosed = closed[g.title];
        return (
          <div key={g.title} className="mt-[22px]">
            <button
              type="button"
              disabled={!g.collapsible}
              onClick={() => setClosed((c) => ({ ...c, [g.title]: !c[g.title] }))}
              className="flex w-full items-center justify-between px-2.5 font-mono text-[10.5px] lowercase tracking-[0.08em] text-side-dim"
            >
              {g.title}
              {g.collapsible && (isClosed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
            </button>
            {!isClosed && (
              <ul className="mt-1.5 space-y-0.5">
                {g.items.map(({ href, label, icon: Icon }) => {
                  const active = href === current;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className={`flex h-[34px] items-center gap-[11px] rounded-[7px] px-2.5 text-[13.5px] ${
                          active ? "bg-side-active text-side-bright shadow-[inset_0_0_0_1px_#2e2a26]" : "text-side-text hover:bg-side-hover hover:text-side-bright"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-ember" : ""}`} />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  const panel = (
    <div className="flex h-full w-[248px] flex-col border-r border-side-line bg-side">
      <div className="flex items-center gap-3 border-b border-side-line px-5 py-[18px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo ?? "/tracksheet-mark.svg"} alt="" className="h-[31px] w-[34px] shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[17px] leading-tight tracking-[-0.01em] text-side-bright">{studio}</div>
          <div className="font-mono text-[9.5px] lowercase tracking-[0.12em] text-side-dim">tracksheet crm</div>
        </div>
        <BellLink unread={unread} onClick={() => setOpen(false)} />
      </div>
      {nav}
      <div className="flex items-center gap-3 border-t border-side-line px-5 py-3.5">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent font-display text-[13px] text-ink">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <Link href="/account" className="block truncate text-[13.5px] text-side-bright hover:underline">{user.name}</Link>
          <div className="font-mono text-[9.5px] lowercase tracking-[0.08em] text-side-dim">{user.role.toLowerCase()}</div>
        </div>
        <ThemeToggle initial={theme} />
        <form action={logout}>
          <button title="Sign out" aria-label="Sign out" className="text-side-dim hover:text-side-bright">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-side px-4 py-3 lg:hidden print:hidden">
        <span className="font-display text-lg tracking-tight text-side-bright">{studio}</span>
        <span className="ml-auto mr-4"><BellLink unread={unread} /></span>
        <button onClick={() => setOpen(true)} className="text-side-text" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside className="fixed inset-y-0 left-0 z-20 hidden lg:block print:hidden">{panel}</aside>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          {panel}
          <button className="flex-1 bg-[#0d0c0b]/60" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="ml-auto mr-4 mt-4 h-5 w-5 text-side-bright" />
          </button>
        </div>
      )}
    </>
  );
}

function BellLink({ unread, onClick }: { unread: number; onClick?: () => void }) {
  return (
    <Link href="/notifications" onClick={onClick} className="relative text-side-dim hover:text-side-bright" aria-label={unread ? `${unread} new notification${unread === 1 ? "" : "s"}` : "Notifications"}>
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-semibold text-ink">{unread > 99 ? "99+" : unread}</span>
      )}
    </Link>
  );
}

"use client";

import { Baby, Home, ListTodo, type LucideIcon, UserRound } from "lucide-react";
import { childUserId, momUserId } from "@/lib/family-users";
import {
  babyPage,
  homePage,
  listPage,
  mePage,
  remindersPage,
  settingsPage,
  trashPage,
  type MainPage
} from "@/lib/main-pages";
import type { UserRole } from "@/lib/types";

type BottomNavProps = {
  activePage: MainPage;
  role?: UserRole;
  onChange: (page: MainPage) => void;
};

const navItems: Array<{ page: MainPage; label: string; icon: LucideIcon }> = [
  { page: homePage, label: "首页", icon: Home },
  { page: listPage, label: "清单", icon: ListTodo },
  { page: babyPage, label: "小柚子", icon: Baby },
  { page: mePage, label: "我的", icon: UserRound }
];

export function BottomNav({ activePage, role = momUserId, onChange }: BottomNavProps) {
  const visibleNavItems =
    role === childUserId ? navItems.filter((item) => item.page === babyPage || item.page === mePage) : navItems;

  return (
    <nav
      aria-label="底部导航"
      className={[
        "bottom-nav-safe fixed bottom-0 left-1/2 grid w-[min(100%,430px)] -translate-x-1/2 gap-1 border-t border-[rgba(231,222,210,0.8)] bg-[rgba(248,244,236,0.9)] px-3 pt-2 backdrop-blur",
        role === childUserId ? "grid-cols-2" : "grid-cols-4"
      ].join(" ")}
    >
      {visibleNavItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          activePage === item.page ||
          (activePage === remindersPage && item.page === homePage) ||
          ((activePage === settingsPage || activePage === trashPage) && item.page === mePage);
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            aria-label={`切换到${item.label}`}
            className={[
              "grid min-h-12 place-items-center gap-0.5 rounded-[14px] border-0 bg-transparent text-[12px]",
              isActive ? "bg-[rgba(79,157,143,0.11)] text-[var(--primary)]" : "text-[var(--muted)]"
            ].join(" ")}
            key={item.page}
            onClick={() => onChange(item.page)}
            type="button"
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

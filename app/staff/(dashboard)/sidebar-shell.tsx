"use client";

import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const STORAGE_KEY = "sidebar-collapsed";
const CHANGE_EVENT = "sidebar-collapsed-change";

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

function getServerSnapshot() {
  return false;
}

function toggle(collapsed: boolean) {
  localStorage.setItem(STORAGE_KEY, collapsed ? "0" : "1");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <aside
      data-collapsed={collapsed}
      className="sidebar no-print relative sticky top-0 flex h-screen shrink-0 flex-col border-r border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]"
    >
      {children}
      <button
        type="button"
        onClick={() => toggle(collapsed)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-6 -right-3 flex h-6 w-6 items-center justify-center rounded-full border border-black/[.08] bg-white text-zinc-500 shadow-sm hover:text-black dark:border-white/[.145] dark:bg-[#0a0a0a] dark:hover:text-zinc-50"
      >
        {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}

import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "../CommandPalette";
import { SyncBanner } from "./SyncBanner";
import { useStore } from "../../lib/store";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const { workspace } = useStore();

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-dvh flex-col lg:pl-[266px]">
        <Topbar onMenu={() => setNavOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <main className="relative flex-1">
          <SyncBanner />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[360px] accent-glow" />
          <div className="relative mx-auto w-full max-w-[1520px] px-4 py-5 md:px-6 md:py-7 lg:px-8">
            <div key={`${workspace.id}:${location.pathname}`} className="animate-fade-up">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

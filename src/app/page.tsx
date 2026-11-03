"use client";

// ── WYRM.LAB · dashboard shell ──────────────────────────────────────

import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  PlayCircle,
  Grid3x3,
  RefreshCcw,
  Trophy,
  Hammer,
  Settings2,
  Swords,
  ChartSpline,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/wyrm/sound";
import { WormLogo } from "@/components/wyrm/brand";
import { OverviewView } from "@/components/wyrm/OverviewView";
import { RunsView } from "@/components/wyrm/RunsView";
import { LevelGallery } from "@/components/wyrm/LevelGallery";
import { LoopView } from "@/components/wyrm/LoopView";
import { Leaderboard } from "@/components/wyrm/OverviewView";
import { PlayDetail } from "@/components/wyrm/PlayDetail";
import { ForgeView } from "@/components/wyrm/ForgeView";
import { AdminView } from "@/components/wyrm/AdminView";
import { ArenaView } from "@/components/wyrm/ArenaView";
import { InsightsView } from "@/components/wyrm/InsightsView";
import { Providers } from "@/components/wyrm/providers";
import { Toaster } from "@/components/ui/toaster";
import type { RunRow } from "@/components/wyrm/types";

type Tab = "overview" | "plays" | "arena" | "levels" | "forge" | "loop" | "insights" | "elo" | "admin";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: "plays", label: "Plays", icon: <PlayCircle className="h-4 w-4" /> },
  { key: "arena", label: "Arena", icon: <Swords className="h-4 w-4" /> },
  { key: "levels", label: "Levels", icon: <Grid3x3 className="h-4 w-4" /> },
  { key: "forge", label: "Forge", icon: <Hammer className="h-4 w-4" /> },
  { key: "loop", label: "The Loop", icon: <RefreshCcw className="h-4 w-4" /> },
  { key: "insights", label: "Insights", icon: <ChartSpline className="h-4 w-4" /> },
  { key: "elo", label: "Leaderboard", icon: <Trophy className="h-4 w-4" /> },
  { key: "admin", label: "Admin", icon: <Settings2 className="h-4 w-4" /> },
];

export default function Home() {
  return (
    <Providers>
      <HomeInner />
    </Providers>
  );
}

function HomeInner() {
  const [tab, setTab] = useState<Tab>("overview");
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [forgeLevelId, setForgeLevelId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  const toggleSound = () => {
    const on = !soundOn;
    setSoundOn(on);
    sfx.unlock();
    sfx.setEnabled(on);
    if (on) sfx.play("eat");
  };

  // lightweight global poll for live status + auto-bootstrap
  const { data: liveData } = useQuery({
    queryKey: ["live"],
    queryFn: async (): Promise<{ running: boolean }> => {
      const r = await fetch("/api/cycles");
      return r.json();
    },
    refetchInterval: 5000,
  });

  const { data: runsData } = useQuery({
    queryKey: ["runs-header"],
    queryFn: async (): Promise<RunRow[]> => {
      const r = await fetch("/api/runs");
      return (await r.json()).runs;
    },
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : 12000),
    enabled: tab === "overview",
  });

  useEffect(() => {
    fetch("/api/bootstrap").catch(() => undefined);
  }, []);

  const watchLatest = () => {
    const runs = runsData ?? [];
    if (runs.length > 0) {
      setOpenRunId(runs[0].id);
      setTab("plays");
    }
  };

  const running = liveData?.running ?? false;

  return (
    <div className="relative min-h-screen">
      {/* ambient backdrop: cave mesh + grid + film grain */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="wyrm-mesh absolute inset-0 opacity-70" />
        <div className="wyrm-grid-bg absolute inset-0" />
        <div className="wyrm-grain absolute inset-0" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-6">
        {/* header */}
        <header className="sticky top-0 z-40 -mx-4 border-b border-border/50 bg-background/70 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="flex h-16 items-center gap-4">
            <button
              className="flex shrink-0 items-center gap-2.5"
              onClick={() => {
                setTab("overview");
                setOpenRunId(null);
              }}
              aria-label="WYRM.LAB home"
            >
              <WormLogo size={32} />
              <div className="hidden sm:block">
                <div className="display-1 text-[16px] text-foreground">
                  WYRM<span className="text-accent">.LAB</span>
                </div>
                <div className="eyebrow mt-0.5">agentic puzzle laboratory</div>
              </div>
            </button>

            {/* tabs */}
            <nav className="wyrm-scroll flex flex-1 items-center gap-1 overflow-x-auto" aria-label="main">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    setOpenRunId(null);
                    if (t.key !== "forge") setForgeLevelId(null);
                  }}
                  className={cn(
                    "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-display text-[13px] font-medium transition-colors",
                    tab === t.key ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.icon}
                  <span className="hidden md:inline">{t.label}</span>
                  {tab === t.key && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                </button>
              ))}
            </nav>

            <button
              onClick={watchLatest}
              className="hidden shrink-0 items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/20 sm:flex"
            >
              <PlayCircle className="h-4 w-4" />
              WATCH
            </button>

            <button
              onClick={toggleSound}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-all",
                soundOn
                  ? "border-primary/50 bg-primary/15 text-primary glow-ring"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
              aria-label={soundOn ? "mute all sound" : "enable sound"}
              title={soundOn ? "sound on" : "sound off — enable game audio"}
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {running && (
              <span className="live-pill breathe hidden border border-accent/40 bg-accent/10 text-accent lg:inline-flex">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
                LOOP LIVE
              </span>
            )}
          </div>
        </header>

        {/* content */}
        <main className="flex-1 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={openRunId ?? tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              {openRunId ? (
                <PlayDetail runId={openRunId} onBack={() => setOpenRunId(null)} />
              ) : tab === "overview" ? (
                <OverviewView
                  onWatchLatest={watchLatest}
                  onGoLoop={() => setTab("loop")}
                  onGoPlays={() => setTab("plays")}
                />
              ) : tab === "plays" ? (
                <RunsView onOpen={(id) => setOpenRunId(id)} />
              ) : tab === "arena" ? (
                <ArenaView />
              ) : tab === "levels" ? (
                <LevelGallery onWatch={(id) => setOpenRunId(id)} />
              ) : tab === "forge" ? (
                <ForgeView
                  publishedLevelId={forgeLevelId}
                  onPublished={(levelId) => setForgeLevelId(levelId)}
                  onGoPlays={() => setTab("plays")}
                />
              ) : tab === "loop" ? (
                <LoopView onOpenRun={(id) => setOpenRunId(id)} />
              ) : tab === "insights" ? (
                <InsightsView />
              ) : tab === "admin" ? (
                <AdminView />
              ) : (
                <Leaderboard />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* footer */}
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 py-5 font-mono text-[10.5px] tracking-wide text-foreground/75">
          <span className="font-mono">
            WYRM.LAB · original engine · every level BFS-certified · every thought recorded
          </span>
          <span className="font-mono">
            game + pipeline built from scratch — no assets taken from any commercial game
          </span>
        </footer>
      </div>
      <Toaster />
    </div>
  );
}

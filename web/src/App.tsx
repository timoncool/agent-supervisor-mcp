import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMediaQuery } from "@base-ui-components/react/unstable-use-media-query";
import { AnimatePresence } from "motion/react";
import { useOverview, useSession } from "./api";
import { RailDrawer } from "./components/RailDrawer";
import { SessionRail } from "./components/SessionRail";
import { SessionBoard } from "./components/SessionBoard";
import { WorkerDrawer } from "./components/WorkerDrawer";
import { HoverProvider } from "./components/HoverCard";
import { Resizer, readDrawerWidth } from "./components/Resizer";
import { StatsScreen } from "./components/StatsScreen";
import { common } from "./i18n/common";
import { useT } from "./lib/i18n";

// Location lives in the hash so a worker can be linked and the page stays a
// single static file: #/s/<session>, #/s/<session>/w/<worker> or #/stats
interface Route {
  stats: boolean;
  session: string | null;
  worker: string | null;
}

function readHash(): Route {
  if (window.location.hash.startsWith("#/stats")) return { stats: true, session: null, worker: null };
  const m = window.location.hash.match(/^#\/s\/([^/]+)(?:\/w\/([^/]+))?/);
  return { stats: false, session: m?.[1] ? decodeURIComponent(m[1]) : null, worker: m?.[2] ? decodeURIComponent(m[2]) : null };
}

function writeHash(route: Route) {
  const { session, worker } = route;
  const next = route.stats ? "#/stats" : session ? `#/s/${encodeURIComponent(session)}${worker ? `/w/${encodeURIComponent(worker)}` : ""}` : "";
  if (window.location.hash !== next) window.history.pushState(null, "", next || window.location.pathname);
}

export function App() {
  const t = useT(common);
  const isDesktop = useMediaQuery("(min-width: 768px)", { noSsr: true });
  const [route, setRoute] = useState(readHash);
  const [railOpen, setRailOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousWorker = useRef(route.worker);
  const [drawerWidth, setDrawerWidth] = useState(readDrawerWidth);
  const onResize = useCallback((fraction: number) => {
    setDrawerWidth(fraction);
    try {
      localStorage.setItem("csv.drawer.width", String(fraction));
    } catch {
      // per-viewer convenience only
    }
  }, []);
  useEffect(() => {
    const sync = () => {
      setRailOpen(false);
      setRoute(readHash());
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const overviewQuery = useOverview();
  const overview = overviewQuery.data?.pages[0];
  const overviewError = overviewQuery.error;
  // No session chosen: open the one with live workers, else the most recent.
  const sessionId = route.session ?? overview?.sessions[0]?.id ?? null;
  const sessionQuery = useSession(route.stats ? null : sessionId);
  const session = sessionQuery.data?.pages[0];
  const sessionError = sessionQuery.error;

  const go = useCallback((s: string | null, w: string | null) => {
    const next = { stats: false, session: s, worker: w };
    writeHash(next);
    setRoute(next);
  }, []);
  const openStats = useCallback(() => {
    setRailOpen(false);
    const next = { stats: true, session: null, worker: null };
    writeHash(next);
    setRoute(next);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !railOpen && route.worker) go(route.session, null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, go, railOpen]);

  useLayoutEffect(() => {
    if (!isDesktop || !railOpen) return;
    setRailOpen(false);
    boardRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
  }, [isDesktop, railOpen]);

  useLayoutEffect(() => {
    const closedWorker = previousWorker.current;
    previousWorker.current = route.worker;
    if (isDesktop || route.worker || !closedWorker) return;
    const main = mainRef.current;
    const row = main?.querySelector<HTMLElement>(`[data-worker-id="${CSS.escape(closedWorker)}"]`);
    (row ?? main)?.focus();
  }, [isDesktop, route.worker]);

  const drawerOpen = route.worker !== null;
  const narrowWorkerOpen = !isDesktop && drawerOpen;
  const rail = (
    <SessionRail
      pages={overviewQuery.data?.pages}
      hasMore={Boolean(overviewQuery.hasNextPage)}
      loadingMore={overviewQuery.isFetchingNextPage}
      loadMore={() => void overviewQuery.fetchNextPage()}
      selected={route.stats ? null : sessionId}
      onSelect={(id) => {
        setRailOpen(false);
        go(id, null);
      }}
      statsOpen={route.stats}
      onOpenStats={openStats}
    />
  );

  return (
    <HoverProvider>
    <div
      ref={boardRef}
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[280px_minmax(0,1fr)_auto_var(--drawer)] md:grid-rows-none"
      style={{ ["--drawer" as string]: drawerOpen ? `${Math.round(drawerWidth * 10000) / 100}%` : "0px" }}
    >
      {isDesktop ? rail : (
        <RailDrawer open={railOpen} onOpenChange={setRailOpen} inert={narrowWorkerOpen}>
          {rail}
        </RailDrawer>
      )}
      <main ref={mainRef} className="min-h-0 min-w-0 outline-none" tabIndex={-1} inert={narrowWorkerOpen}>
        {route.stats && <StatsScreen />}
        {!route.stats && overviewError && <p className="t-subhead p-8 text-red">{t("backendDown", { message: overviewError.message })}</p>}
        {!route.stats && !overviewError && !session && !sessionError && <p className="t-subhead p-8 text-label-2">{overview ? t("pickSession") : t("loading")}</p>}
        {!route.stats && sessionError && <p className="t-subhead p-8 text-red">{t("sessionError", { message: sessionError.message })}</p>}
        {!route.stats && session && sessionQuery.data && (
          <SessionBoard
            pages={sessionQuery.data.pages}
            hasMore={Boolean(sessionQuery.hasNextPage)}
            loadingMore={sessionQuery.isFetchingNextPage}
            loadMore={() => void sessionQuery.fetchNextPage()}
            selectedWorker={route.worker}
            onSelectWorker={(id) => go(sessionId, id)}
          />
        )}
      </main>
      <div className={drawerOpen ? "hidden h-full min-h-0 md:block" : "hidden"}>{drawerOpen && <Resizer onChange={onResize} />}</div>
      <div className={`min-h-0 overflow-hidden ${narrowWorkerOpen ? "fixed inset-0 z-40 bg-bg" : drawerOpen ? "" : "hidden md:block"}`}>
        <AnimatePresence>
          {drawerOpen && route.worker && (
            <WorkerDrawer key={route.worker} workerId={route.worker} focusClose={narrowWorkerOpen} onClose={() => go(sessionId, null)} onOpenWorker={(id) => go(sessionId, id)} />
          )}
        </AnimatePresence>
      </div>
    </div>
    </HoverProvider>
  );
}

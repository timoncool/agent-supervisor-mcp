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
  const isWide = useMediaQuery("(min-width: 1120px)", { noSsr: true });
  const [route, setRoute] = useState(readHash);
  const [railOpen, setRailOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const workerToRefocus = useRef<string | null>(null);
  const drawerOpen = route.worker !== null;
  const phoneWorker = !isDesktop && drawerOpen;
  const overlayWorker = !isWide && drawerOpen;
  const [drawerWidth, setDrawerWidth] = useState(readDrawerWidth);
  const onResize = useCallback((fraction: number) => {
    setDrawerWidth(fraction);
    try {
      localStorage.setItem("csv.drawer.width", String(fraction));
    } catch {
      // per-viewer convenience only
    }
  }, []);
  const changeRoute = useCallback((next: Route, fromCloseWorker = false) => {
    const restoreFocus = overlayWorker && next.worker === null &&
      (fromCloseWorker || drawerRef.current?.contains(document.activeElement));
    workerToRefocus.current = restoreFocus ? route.worker : null;
    setRoute(next);
  }, [overlayWorker, route.worker]);

  useLayoutEffect(() => {
    const sync = () => {
      setRailOpen(false);
      changeRoute(readHash());
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [changeRoute]);

  const overviewQuery = useOverview();
  const overview = overviewQuery.data?.pages[0];
  const overviewError = overviewQuery.error;
  // No session chosen: open the one with live workers, else the most recent.
  const sessionId = route.session ?? overview?.sessions[0]?.id ?? null;
  const sessionQuery = useSession(route.stats ? null : sessionId);
  const session = sessionQuery.data?.pages[0];
  const sessionError = sessionQuery.error;

  const go = useCallback((s: string | null, w: string | null, fromCloseWorker = false) => {
    const next = { stats: false, session: s, worker: w };
    writeHash(next);
    changeRoute(next, fromCloseWorker);
  }, [changeRoute]);
  const closeWorker = useCallback(() => {
    go(sessionId, null, true);
  }, [go, sessionId]);
  const openStats = useCallback(() => {
    setRailOpen(false);
    const next = { stats: true, session: null, worker: null };
    writeHash(next);
    changeRoute(next);
  }, [changeRoute]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !railOpen && drawerOpen) closeWorker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeWorker, drawerOpen, railOpen]);

  useLayoutEffect(() => {
    if (!isDesktop || !railOpen) return;
    setRailOpen(false);
    boardRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
  }, [isDesktop, railOpen]);

  useLayoutEffect(() => {
    const closedWorker = workerToRefocus.current;
    if (drawerOpen || closedWorker === null) return;
    workerToRefocus.current = null;
    const main = mainRef.current;
    const row = main?.querySelector<HTMLElement>(`[data-worker-id="${CSS.escape(closedWorker)}"]`);
    (row ?? main)?.focus();
  }, [drawerOpen]);

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
      style={{ ["--drawer" as string]: isWide && drawerOpen ? `min(${Math.round(drawerWidth * 10000) / 100}%, calc(100vw - 280px - 360px))` : "0px" }}
    >
      {isDesktop ? rail : (
        <RailDrawer open={railOpen} onOpenChange={setRailOpen} inert={phoneWorker}>
          {rail}
        </RailDrawer>
      )}
      <main ref={mainRef} className="min-h-0 min-w-0 outline-none md:col-start-2 md:row-start-1" tabIndex={-1} inert={overlayWorker}>
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
      {isWide && drawerOpen && (
        <div className="col-start-3 row-start-1 h-full min-h-0"><Resizer onChange={onResize} /></div>
      )}
      <div
        ref={drawerRef}
        className={`min-h-0 overflow-hidden ${phoneWorker ? "fixed inset-0 z-40 bg-bg" : overlayWorker ? "relative z-10 col-start-2 row-start-1 bg-bg" : "col-start-4 row-start-1"} ${drawerOpen ? "" : "hidden md:block"}`}
        inert={!drawerOpen}
      >
        <AnimatePresence>
          {drawerOpen && route.worker && (
            <WorkerDrawer key={route.worker} workerId={route.worker} focusClose={overlayWorker} onClose={closeWorker} onOpenWorker={(id) => go(sessionId, id)} />
          )}
        </AnimatePresence>
      </div>
    </div>
    </HoverProvider>
  );
}

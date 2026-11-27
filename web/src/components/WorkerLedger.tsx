import { motion } from "motion/react";
import type { SessionDetail, WorkerRow } from "../api";
import { board } from "../i18n/board";
import { tr } from "../lib/i18n";
import { useLoadMore } from "../lib/useLoadMore";
import { clock, duration, plain, relative } from "../lib/format";
import { StatusText } from "./StatusMark";
import { CardRow, HoverCard } from "./HoverCard";
import { relativeToWorktree, shortId } from "../lib/format";

interface Props {
  pages: SessionDetail[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  selected: string | null;
  onSelect: (id: string) => void;
}

const GRID = "grid-cols-[112px_minmax(0,1fr)_96px_64px_64px_112px]";

// A grouped inset table: one header row, one line per worker, hairline
// separators. The row is the hit target, the whole row.
function Row({ worker, active, onSelect, index }: { worker: WorkerRow; active: boolean; onSelect: () => void; index: number }) {
  const running = worker.status === "running";
  const secondary = running ? worker.current_action : (worker.error ?? (plain(worker.last_message, 160) || worker.goal));
  // The dispatcher's own checks: one glyph, since this is the one place the
  // user looks instead of reading logs.
  const acceptance = worker.acceptance === "passed"
    ? { glyph: "✓", cls: "text-green", title: tr(board, "ledger.passed") }
    : worker.acceptance === "failed"
      ? { glyph: "✗", cls: "text-red", title: tr(board, "ledger.failed") }
      : worker.acceptance === "running"
        ? { glyph: "…", cls: "text-orange", title: tr(board, "ledger.running") }
        : worker.acceptance
          ? { glyph: "?", cls: "text-label-3", title: tr(board, worker.acceptance === "interrupted" ? "ledger.interrupted" : "ledger.cancelled") }
          : null;
  return (
    <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.025 }}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`grid w-full ${GRID} items-center gap-x-4 px-4 py-3 text-left transition-colors duration-150 ${active ? "bg-blue/12" : "hover:bg-fill/60"}`}
      >
        <StatusText status={worker.status} phase={worker.phase} className="t-subhead" />
        <span className="min-w-0">
          <HoverCard
            side="bottom"
            render={<span className="t-headline block truncate">{worker.title}</span>}
          >
            <div className="t-headline">{worker.title}</div>
            <CardRow label="Goal">{worker.goal ?? "—"}</CardRow>
            {worker.owned_paths.length > 0 && (
              <CardRow label={tr(board, "ownedPaths")}>
                <ul className="mono space-y-0.5">{worker.owned_paths.map((p) => <li key={p} className="truncate" title={p}>{relativeToWorktree(p, worker.project_root)}</li>)}</ul>
              </CardRow>
            )}
            {worker.branch && <CardRow label={tr(board, "branch")}><span className="mono">{worker.branch}</span>{worker.base_commit && <span className="mono text-label-2"> ← {worker.base_commit.slice(0, 7)}</span>}</CardRow>}
            {worker.depends_on.length > 0 && <CardRow label={tr(board, "ledger.dependsOn")}><span className="mono">{worker.depends_on.map((d) => shortId(d)).join(", ")}</span></CardRow>}
            {worker.model && <CardRow label={tr(board, "model")}><span className="mono">{worker.model}</span></CardRow>}
          </HoverCard>

          <span className={`t-footnote mt-0.5 block truncate ${running ? "mono text-orange" : worker.error ? "text-red" : "text-label-2"}`} title={secondary ?? undefined}>
            {acceptance && <span className={`${acceptance.cls} mr-1`} title={acceptance.title}>{acceptance.glyph}</span>}
            {secondary || "—"}
          </span>
        </span>
        <span className="t-subhead tabular text-right text-label-2">{duration(worker.duration_ms)}</span>
        <span className={`t-subhead tabular text-right ${worker.changed_file_count > 0 ? "text-label" : "text-label-3"}`}>{worker.changed_file_count}</span>
        <span className="t-subhead tabular text-right text-label-2">{worker.command_count}</span>
        <span className="t-footnote tabular text-right text-label-2" title={clock(worker.updated_at)}>{relative(worker.updated_at)}</span>
      </button>
    </motion.li>
  );
}

export function WorkerLedger({ pages, hasMore, loadingMore, loadMore, selected, onSelect }: Props) {
  // Pages arrive in dispatch order already; keep them as they come.
  const workers = pages.flatMap((p) => p.workers);
  const total = pages[0]?.worker_count ?? workers.length;
  const sentinel = useLoadMore(hasMore, loadingMore, loadMore);
  return (
    <section className="inset overflow-hidden">
      <div className={`grid ${GRID} gap-x-4 border-b border-separator-soft px-4 py-2`}>
        <span className="t-footnote text-label-2">{tr(board, "ledger.status")}</span>
        <span className="t-footnote text-label-2">Worker</span>
        <span className="t-footnote text-right text-label-2">{tr(board, "duration")}</span>
        <span className="t-footnote text-right text-label-2" title={tr(board, "ledger.filesTitle")}>{tr(board, "ledger.files")}</span>
        <span className="t-footnote text-right text-label-2">{tr(board, "ledger.commands")}</span>
        <span className="t-footnote text-right text-label-2">{tr(board, "ledger.updated")}</span>
      </div>
      <ol className="divide-y divide-separator-soft">
        {workers.map((worker, index) => (
          <Row key={worker.id} worker={worker} index={index} active={worker.id === selected} onSelect={() => onSelect(worker.id)} />
        ))}
      </ol>
      <div ref={sentinel} className="t-caption border-t border-separator-soft px-4 py-2.5 text-center text-label-3">
        {hasMore ? (loadingMore ? tr(board, "ledger.loadingMore") : tr(board, "ledger.shown", { shown: workers.length, total })) : tr(board, "ledger.total", { n: total })}
      </div>
    </section>
  );
}

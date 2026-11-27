import { useState } from "react";
import { Tabs } from "@base-ui-components/react/tabs";
import { motion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { useEvents, useWorker, type WorkerDetail } from "../api";
import { board } from "../i18n/board";
import { clock, duration, relativeToWorktree, tokens } from "../lib/format";
import { tr } from "../lib/i18n";
import { StatusText } from "./StatusMark";
import { EventStream } from "./EventStream";
import { Markdown } from "./Markdown";
import { SideChat } from "./SideChat";
import { PanelFade, Segmented } from "./Segmented";

interface Props {
  workerId: string;
  onClose: () => void;
  onOpenWorker: (id: string) => void;
}

// Inspector rows: label left, value right, hairline between. The Finder
// "Get Info" shape, which every Mac user already knows how to read.
function KV({ label, children, mono = false, title }: { label: string; children: React.ReactNode; mono?: boolean; title?: string }) {
  return (
    <div className="flex min-h-[36px] items-center gap-4 py-1.5">
      <span className="t-subhead w-20 shrink-0 text-label-2">{label}</span>
      <span className={`t-subhead min-w-0 flex-1 truncate text-right ${mono ? "mono" : ""}`} title={title}>{children}</span>
    </div>
  );
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      {title && <div className="group-header mb-1.5 px-1">{title}</div>}
      <div className="inset divide-y divide-separator-soft px-4">{children}</div>
    </section>
  );
}

// Codex repeats its startup warnings on every run of a thread. Show each
// distinct sentence once, folded by default.
function Notices({ text }: { text: string }) {
  const lines = Array.from(new Set(text.split(/(?<=\.)\s+(?=[A-Z])|\n+/).map((l) => l.trim()).filter(Boolean)));
  return (
    <details className="group mt-4 px-1">
      <summary className="t-footnote cursor-pointer list-none text-label-2 hover:text-label">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
        {tr(board, "codexNotices", { n: lines.length })}
      </summary>
      <ul className="t-footnote mt-1.5 space-y-1 pl-4 text-label-2">
        {lines.map((l) => <li key={l} className="list-disc">{l}</li>)}
      </ul>
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="t-subhead py-10 text-center text-label-2">{children}</p>;
}

function Reports({ worker }: { worker: WorkerDetail }) {
  if (worker.reports.length === 0) return <Empty>{tr(board, "drawer.noReports")}</Empty>;
  const list = [...worker.reports].reverse();
  return (
    <div className="space-y-3">
      {list.map((text, i) => (
        <article key={i} className="inset px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="group-header">{i === 0 ? tr(board, "drawer.finalReport") : tr(board, "drawer.earlierReport", { n: list.length - i })}</span>
            <span className="t-caption ml-auto text-label-3">{tr(board, "chars", { n: text.length })}</span>
          </div>
          <Markdown text={text} className="mt-2" />
        </article>
      ))}
    </div>
  );
}

function Changes({ worker }: { worker: WorkerDetail }) {
  if (worker.changed_files.length === 0) return <Empty>{tr(board, "drawer.noChanges")}</Empty>;
  return (
    <ul className="inset divide-y divide-separator-soft px-4">
      {worker.changed_files.map((file) => (
        <li key={file} className="t-subhead mono flex min-h-[36px] items-center py-1.5" title={file}>
          <span className="truncate">{relativeToWorktree(file, worker.worktree_path)}</span>
        </li>
      ))}
    </ul>
  );
}

function Commands({ worker }: { worker: WorkerDetail }) {
  if (worker.commands.length === 0) return <Empty>{tr(board, "drawer.noCommands")}</Empty>;
  const list = [...worker.commands].reverse();
  return (
    <ol className="inset divide-y divide-separator-soft px-4">
      {list.map((entry, i) => {
        const bad = entry.exit_code !== null && entry.exit_code !== 0;
        return (
          <li key={i} className="py-2.5">
            <div className="t-caption flex items-center gap-2">
              <span className={`tabular ${bad ? "text-red" : "text-green"}`}>exit {entry.exit_code ?? "?"}</span>
              <span className="ml-auto text-label-3">{clock(entry.completed_at)}</span>
            </div>
            <pre className="t-footnote mono mt-1 whitespace-pre-wrap break-all text-label">{entry.command}</pre>
          </li>
        );
      })}
    </ol>
  );
}

const TABS = [
  { value: "overview" },
  { value: "report" },
  { value: "changes" },
  { value: "commands" },
  { value: "events" },
  { value: "prompt" },
  { value: "ask" }
] as const;
type TabValue = (typeof TABS)[number]["value"];

export function WorkerDrawer({ workerId, onClose, onOpenWorker }: Props) {
  const [tab, setTab] = useState<TabValue>("report");
  const { data: worker, error } = useWorker(workerId);
  const { data: eventData } = useEvents(workerId, tab === "events");
  const counts: Partial<Record<TabValue, number>> = worker
    ? { changes: worker.changed_files.length, commands: worker.command_count, events: worker.event_kinds.reduce((n, k) => n + k.count, 0) }
    : {};
  // A resumed worker records resumed_from = its own id (same row, more runs);
  // only a genuinely different parent is worth a link.
  const rawParent = worker?.followup_of ?? worker?.resumed_from ?? null;
  const parent = rawParent && rawParent !== worker?.id ? rawParent : null;

  return (
    <motion.section
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex h-full min-h-0 flex-col border-l border-separator-soft bg-bg"
      aria-label={tr(board, "drawer.label")}
    >
      {!worker && <p className="t-subhead p-8 text-label-2">{error ? tr(board, "loadFailed", { message: error.message }) : tr(board, "loading")}</p>}
      {worker && (
        <>
          {/* 1. Identity: who this worker is and what it is doing now. Fixed. */}
          <header className="shrink-0 border-b border-separator-soft px-6 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <StatusText status={worker.status} phase={worker.phase} className="t-footnote" />
                <h2 className="t-title2 mt-1">{worker.title}</h2>
                {worker.goal && <p className="t-subhead mt-1 line-clamp-2 text-label-2" title={worker.goal}>{worker.goal}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label={tr(board, "close")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill text-label-2 hover:bg-fill-2">
                <X size={14} weight="bold" />
              </button>
            </div>
            {worker.status === "running" && worker.current_action && (
              <p className="t-footnote mono mt-3 truncate text-orange" title={worker.current_action}>{worker.current_action}</p>
            )}
            {worker.error && (worker.status === "running" || worker.status === "queued"
              ? <p className="t-footnote mt-3 text-label-2">{tr(board, "drawer.lastRun", { error: worker.error })}</p>
              : <p className="t-footnote mt-3 rounded-lg bg-red/10 px-3 py-1.5 text-red">{worker.error}</p>)}

            {/* 2. The numbers that matter, one line. */}
            <div className="t-footnote mono tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label-2">
              <span title={tr(board, "duration")}>{duration(worker.duration_ms)}</span>
              <span title={tr(board, "drawer.filesTitle")}>{tr(board, "drawer.files", { n: worker.changed_files.length })}</span>
              <span title={tr(board, "drawer.commandsTitle")}>{tr(board, "drawer.commands", { n: worker.command_count })}</span>
              <span title={tr(board, "tokensTitle", { in: worker.usage.input_tokens, cached: worker.usage.cached_input_tokens, out: worker.usage.output_tokens })}>
                {tokens(worker.usage.input_tokens)} in · {tokens(worker.usage.output_tokens)} out
              </span>
              {worker.exit_code !== null && <span title={tr(board, "exitCode")}>exit {worker.exit_code}</span>}
              {worker.run_count > 1 && <span>{tr(board, "drawer.runN", { n: worker.run_count })}</span>}
            </div>
          </header>

          {/* 3. Tabs fixed, content below scrolls. The side chat owns its own scroll. */}
          <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabValue)} className="flex min-h-0 flex-1 flex-col">
            <div className="mx-6 mt-3">
              <Segmented value={tab} segments={TABS.map((t) => ({ value: t.value, label: tr(board, `tab.${t.value}`), count: counts[t.value] }))} />
            </div>

            {/* The side chat stays mounted while the drawer is open, so
                switching tabs never drops a stream it is watching. */}
            <Tabs.Panel value="ask" keepMounted className={`min-h-0 flex-1 flex-col px-6 pb-4 pt-3 ${tab === "ask" ? "flex" : "hidden"}`}>
              <SideChat workerId={worker.id} canAsk={Boolean(worker.thread_id)} running={worker.status === "running"} />
            </Tabs.Panel>
            {tab !== "ask" && (
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-3">
                <PanelFade id={tab}>
                <Tabs.Panel value="overview">
                  <Group title={tr(board, "drawer.groupRun")}>
                    <KV label={tr(board, "drawer.started")} mono>{clock(worker.started_at ?? worker.created_at)}</KV>
                    <KV label={tr(board, "drawer.finished")} mono>{clock(worker.completed_at)}</KV>
                    <KV label={tr(board, "duration")}>{duration(worker.duration_ms)}</KV>
                    <KV label={tr(board, "exitCode")} mono>{worker.exit_code ?? "—"}</KV>
                    <KV label={tr(board, "drawer.runCount")} mono>{worker.run_count}</KV>
                    {worker.pid && worker.status === "running" && <KV label="pid" mono>{worker.pid}</KV>}
                  </Group>
                  <Group title={tr(board, "drawer.groupModel")}>
                    <KV label={tr(board, "model")} mono>{worker.model ?? tr(board, "drawer.defaultModel")}</KV>
                    <KV label="tokens" mono title={`${tr(board, "tokensTitle", { in: worker.usage.input_tokens, cached: worker.usage.cached_input_tokens, out: worker.usage.output_tokens })} / ${worker.usage.turns} turn`}>
                      {tokens(worker.usage.input_tokens)} in · {tokens(worker.usage.output_tokens)} out
                    </KV>
                    <KV label={tr(board, "drawer.sandbox")} mono>{worker.sandbox}</KV>
                    <KV label="thread" mono title={worker.thread_id ?? ""}>{worker.thread_id ?? "—"}</KV>
                    <KV label="worker" mono title={worker.id}>{worker.id}</KV>
                    <KV label="session" mono>{worker.session_id ?? "—"}</KV>
                  </Group>
                  <Group title={tr(board, "drawer.groupCode")}>
                    <KV label={tr(board, "branch")} mono title={worker.branch ?? ""}>{worker.branch ?? "—"}</KV>
                    <KV label={tr(board, "drawer.base")} mono title={worker.base_commit ?? ""}>{worker.base_commit ? worker.base_commit.slice(0, 12) : "—"}</KV>
                    <KV label="worktree" mono title={worker.worktree_path ?? ""}>{worker.worktree_path ?? "—"}</KV>
                    <KV label={tr(board, "drawer.project")} mono title={worker.project_root}>{worker.project_root}</KV>
                    {parent && (
                      <KV label={tr(board, worker.followup_of ? "drawer.followupOf" : "drawer.resumedFrom")} mono>
                        <button type="button" className="text-blue" onClick={() => onOpenWorker(parent)}>{parent}</button>
                      </KV>
                    )}
                  </Group>
                  {worker.owned_paths.length > 0 && (
                    <Group title={tr(board, "ownedPaths")}>
                      {worker.owned_paths.map((p) => (
                        <div key={p} className="t-footnote mono flex min-h-[32px] items-center py-1 text-label" title={p}><span className="truncate">{relativeToWorktree(p, worker.project_root)}</span></div>
                      ))}
                    </Group>
                  )}
                  {worker.notices && <Notices text={worker.notices} />}
                </Tabs.Panel>
                <Tabs.Panel value="report"><Reports worker={worker} /></Tabs.Panel>
                <Tabs.Panel value="changes"><Changes worker={worker} /></Tabs.Panel>
                <Tabs.Panel value="commands"><Commands worker={worker} /></Tabs.Panel>
                <Tabs.Panel value="events" className="h-[70vh]"><EventStream events={eventData?.events ?? []} /></Tabs.Panel>
                <Tabs.Panel value="prompt"><pre className="inset t-subhead whitespace-pre-wrap break-words px-4 py-3 font-sans text-label">{worker.prompt ?? "—"}</pre></Tabs.Panel>
                </PanelFade>
              </div>
            )}
          </Tabs.Root>
        </>
      )}
    </motion.section>
  );
}

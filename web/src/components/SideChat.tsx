import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { PaperPlaneRight, Stop, ArrowCounterClockwise, CaretRight } from "@phosphor-icons/react";
import { Markdown } from "./Markdown";
import { clock, tokens } from "../lib/format";
import { board } from "../i18n/board";
import { tr } from "../lib/i18n";

// A side conversation about one worker, the way Codex's /btw works: the
// worker's thread is forked, questions go to the fork, the worker is never
// touched. The server owns the turns: this panel rebuilds the conversation
// from the server on open, and when a turn is running (started here, in
// another tab, or before a reload) it attaches and replays it. Only
// "stop" kills a turn; "end" deletes the fork and the history.
interface Props {
  workerId: string;
  canAsk: boolean;
  running: boolean;
}

interface TurnRecord {
  id: string;
  question: string;
  status: "running" | "completed" | "failed" | "stopped" | "timed_out" | "interrupted";
  started_at: string;
  ended_at: string | null;
  usage: Record<string, number> | null;
  error: string | null;
  parts: Array<Record<string, unknown> & { type: string }>;
}

interface ChatState {
  can_ask: boolean;
  worker_status: string;
  active: boolean;
  fork_thread_id: string | null;
  busy: boolean;
  busy_since: string | null;
  busy_turn_id: string | null;
  watchers: number;
  turns: TurnRecord[];
}

type ToolInput = { command?: string; changes?: unknown[] } & Record<string, unknown>;
type ToolOutput = { exit_code?: number | null; status?: string | null; output?: string } & Record<string, unknown>;

function statusWord(status: TurnRecord["status"]): string {
  switch (status) {
    case "running": return tr(board, "chat.running");
    case "completed": return "";
    case "failed": return tr(board, "chat.failed");
    case "stopped": return tr(board, "chat.stopped");
    case "timed_out": return tr(board, "chat.timedOut");
    case "interrupted": return tr(board, "chat.interrupted");
  }
}

function describeError(message: string): string {
  if (/"busy"/.test(message)) return tr(board, "chat.errBusy");
  if (/"no_thread"/.test(message)) return tr(board, "chat.errNoThread");
  if (/"codex_missing"/.test(message)) return tr(board, "chat.errCodexMissing");
  if (/Failed to fetch|NetworkError|Load failed/.test(message)) return tr(board, "chat.errNetwork");
  return message;
}

function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const first = text.split("\n").find((l) => l.trim()) ?? "";
  return (
    <div className="t-footnote text-label-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-[28px] items-center gap-1 text-left hover:text-label">
        <CaretRight size={11} weight="bold" className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="truncate">{open ? tr(board, "chat.thinking") : first.slice(0, 120)}</span>
      </button>
      {open && <pre className="mt-1 whitespace-pre-wrap break-words pl-4 font-sans text-label-2">{text}</pre>}
    </div>
  );
}

function Tool({ name, input, output }: { name: string; input?: ToolInput; output?: ToolOutput }) {
  const [open, setOpen] = useState(false);
  const label = name === "shell" ? (input?.command ?? "") : name;
  const bad = output?.exit_code !== undefined && output?.exit_code !== null && output.exit_code !== 0;
  return (
    <div className="inset my-1 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-[32px] w-full items-center gap-2 px-3 text-left">
        <CaretRight size={11} weight="bold" className={`shrink-0 text-label-3 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className={`t-caption shrink-0 rounded px-1.5 py-0.5 font-medium ${output ? (bad ? "bg-red/12 text-red" : "bg-green/12 text-green") : "bg-fill text-label-2"}`}>
          {output ? `exit ${output.exit_code ?? "?"}` : tr(board, "chat.runningCmd")}
        </span>
        <span className="t-footnote mono min-w-0 flex-1 truncate text-label">{label}</span>
      </button>
      {open && (
        <pre className="t-caption mono max-h-64 overflow-auto border-t border-separator-soft px-3 py-2 whitespace-pre-wrap break-all text-label-2">
          {input?.command ? `$ ${input.command}\n` : JSON.stringify(input, null, 2) + "\n"}
          {output?.output ?? (output ? JSON.stringify(output, null, 2) : "…")}
        </pre>
      )}
    </div>
  );
}

function AssistantMessage({ message, turn }: { message: UIMessage; turn?: TurnRecord }) {
  const parts = message.parts as Array<Record<string, unknown> & { type: string }>;
  const notices = parts.filter((p) => p.type === "data-notice");
  const usage = (parts.filter((p) => p.type === "data-usage").at(-1) as { data?: Record<string, number> } | undefined)?.data ?? turn?.usage ?? null;
  const verdict = turn && turn.status !== "completed" && turn.status !== "running" ? statusWord(turn.status) : null;
  return (
    <div className="space-y-1.5">
      {parts.map((p, i) => {
        if (p.type === "reasoning") return <Reasoning key={i} text={String(p.text ?? "")} />;
        if (p.type === "text") return <Markdown key={i} text={String(p.text ?? "")} className="inset px-4 py-3" />;
        if (p.type.startsWith("tool-") || p.type === "dynamic-tool") {
          const name = p.type === "dynamic-tool" ? String(p.toolName ?? "tool") : p.type.slice(5);
          return <Tool key={i} name={name} input={p.input as ToolInput} output={p.output as ToolOutput | undefined} />;
        }
        return null;
      })}
      {verdict && <p className="t-footnote text-red">{verdict}{turn?.error && turn.error !== "stopped" ? `: ${turn.error}` : ""}</p>}
      {notices.length > 0 && (
        <details className="t-caption text-label-3">
          <summary className="cursor-pointer">{tr(board, "codexNotices", { n: notices.length })}</summary>
          <ul className="mt-1 list-disc pl-4">{notices.map((n, i) => <li key={i}>{String((n.data as { message?: string })?.message ?? "")}</li>)}</ul>
        </details>
      )}
      {usage && (
        <div className="t-caption mono text-label-3">
          {tr(board, "chat.usage", { in: tokens(usage.input_tokens ?? 0), cached: tokens(usage.cached_input_tokens ?? 0), out: tokens(usage.output_tokens ?? 0) })}
        </div>
      )}
    </div>
  );
}

// Rebuild the useChat message list from the server's turn history. A running
// turn contributes only its question; resumeStream() fills in the answer.
function messagesFromTurns(turns: TurnRecord[]): UIMessage[] {
  const out: UIMessage[] = [];
  for (const t of turns) {
    out.push({ id: `u-${t.id}`, role: "user", parts: [{ type: "text", text: t.question }] } as UIMessage);
    if (t.status !== "running") out.push({ id: t.id, role: "assistant", parts: t.parts as UIMessage["parts"] } as UIMessage);
  }
  return out;
}

export function SideChat({ workerId, canAsk, running }: Props) {
  const api = `/api/workers/${encodeURIComponent(workerId)}/chat`;
  const transport = useMemo(() => new DefaultChatTransport({ api }), [api]);
  const { messages, sendMessage, status, stop, error, setMessages, resumeStream, clearError } = useChat({ id: `side-${workerId}`, transport });
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<ChatState | null>(null);
  const [attaching, setAttaching] = useState(false);
  const hydratedFor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const streaming = status === "submitted" || status === "streaming";

  const refresh = useCallback(async (): Promise<ChatState | null> => {
    try {
      const next = (await (await fetch(api)).json()) as ChatState;
      setState(next);
      return next;
    } catch {
      return null;
    }
  }, [api]);

  // Open: rebuild from the server, then attach to whatever is running.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await refresh();
      if (!s || cancelled || hydratedFor.current === workerId) return;
      hydratedFor.current = workerId;
      setMessages(messagesFromTurns(s.turns));
      if (s.busy) {
        setAttaching(true);
        await resumeStream().catch(() => {});
        if (!cancelled) {
          setAttaching(false);
          await refresh();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // When our own stream finishes, the server has the final verdict.
  useEffect(() => {
    if (status === "ready" || status === "error") void refresh();
  }, [status, refresh]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const busyElsewhere = Boolean(state?.busy) && !streaming && !attaching;

  const submit = async () => {
    const text = draft.trim();
    if (!text || streaming || attaching || !canAsk) return;
    const s = await refresh();
    if (s?.busy) return; // the banner offers attach or stop
    setDraft("");
    clearError();
    void sendMessage({ text });
  };

  const attach = async () => {
    setAttaching(true);
    const s = await refresh();
    if (s) setMessages(messagesFromTurns(s.turns));
    await resumeStream().catch(() => {});
    setAttaching(false);
    await refresh();
  };

  const stopTurn = async () => {
    await fetch(`${api}/stop`, { method: "POST" });
    stop();
    await refresh();
  };

  const end = async () => {
    stop();
    await fetch(api, { method: "DELETE" });
    setMessages([]);
    clearError();
    await refresh();
  };

  const turnById = new Map((state?.turns ?? []).map((t) => [t.id, t]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {messages.length === 0 && !busyElsewhere && (
          <p className="t-subhead px-1 py-6 text-label-2">
            {canAsk
              ? [tr(board, "chat.intro"), ...(running ? [tr(board, "chat.introRunning")] : []), tr(board, "chat.introKeep")].join(" ")
              : tr(board, "chat.noThread")}
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="t-subhead max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue px-3.5 py-2 text-white">
                {(m.parts as Array<{ type: string; text?: string }>).filter((p) => p.type === "text").map((p) => p.text).join("\n")}
              </div>
            </div>
          ) : (
            <div key={m.id} className="max-w-[95%]"><AssistantMessage message={m} turn={turnById.get(m.id)} /></div>
          )
        )}
        {(streaming || attaching) && (
          <div className="t-footnote flex items-center gap-2 px-1 text-label-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-orange" />
            {attaching ? tr(board, "chat.attaching") : status === "submitted" ? tr(board, "chat.forking") : tr(board, "chat.pondering")}
            <button type="button" onClick={stopTurn} className="ml-2 text-blue">{tr(board, "chat.stop")}</button>
          </div>
        )}
        {busyElsewhere && (
          <div className="t-footnote flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-orange/10 px-3 py-2 text-label">
            <span>{tr(board, "chat.busy", { since: state?.busy_since ? tr(board, "chat.since", { time: clock(state.busy_since) }) : tr(board, "chat.justNow"), watchers: tr(board, state?.watchers ? "chat.watched" : "chat.unwatched") })}</span>
            <button type="button" onClick={attach} className="font-semibold text-blue">{tr(board, "chat.attach")}</button>
            <button type="button" onClick={stopTurn} className="text-red">{tr(board, "chat.stopIt")}</button>
          </div>
        )}
        {error && <p className="t-footnote rounded-lg bg-red/10 px-3 py-2 text-red">{describeError(error.message)}</p>}
      </div>

      <div className="shrink-0 border-t border-separator-soft pt-3">
        <div className="inset flex items-end gap-2 px-3 py-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={tr(board, canAsk ? "chat.placeholder" : "chat.placeholderNoThread")}
            disabled={!canAsk}
            rows={Math.min(6, Math.max(1, draft.split("\n").length))}
            className="t-subhead min-h-[28px] flex-1 resize-none bg-transparent py-1 text-label outline-none placeholder:text-label-3 disabled:opacity-50"
          />
          {streaming || attaching ? (
            <button type="button" onClick={stopTurn} aria-label={tr(board, "chat.stop")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-label hover:bg-fill-2">
              <Stop size={14} weight="fill" />
            </button>
          ) : (
            <button type="button" onClick={() => void submit()} disabled={!draft.trim() || !canAsk || busyElsewhere} aria-label={tr(board, "chat.send")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue text-white disabled:opacity-40">
              <PaperPlaneRight size={14} weight="fill" />
            </button>
          )}
        </div>
        <div className="t-caption mt-1.5 flex items-center justify-between px-1 text-label-3">
          <span>{tr(board, "chat.footer")}{state?.fork_thread_id ? tr(board, "chat.forked") : ""}</span>
          {(messages.length > 0 || state?.active) && (
            <button type="button" onClick={end} className="inline-flex items-center gap-1 hover:text-label">
              <ArrowCounterClockwise size={12} /> {tr(board, "chat.reset")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

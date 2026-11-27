import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { RawEvent } from "../api";
import { board } from "../i18n/board";
import { tr } from "../lib/i18n";

function eventLine(event: RawEvent): { kind: string; text: string; danger?: boolean } {
  const item = event.item;
  if (event.type === "item.started" || event.type === "item.completed" || event.type === "item.updated") {
    const t = item?.type ?? "item";
    const done = event.type === "item.completed";
    if (t === "command_execution") return { kind: tr(board, done ? "event.commandDone" : "event.command"), text: String(item?.command ?? "") };
    if (t === "agent_message") return { kind: tr(board, "event.report"), text: String(item?.text ?? "") };
    if (t === "reasoning") return { kind: tr(board, "event.thinking"), text: String(item?.text ?? "") };
    if (t === "file_change") return { kind: tr(board, "event.fileChange"), text: JSON.stringify(item?.changes ?? item) };
    if (t === "error") return { kind: tr(board, "event.error"), text: String(item?.message ?? item?.text ?? ""), danger: true };
    return { kind: t, text: JSON.stringify(item) };
  }
  if (event.type === "turn.completed") return { kind: tr(board, "event.turnDone"), text: JSON.stringify(event.usage ?? {}) };
  if (event.type === "turn.failed") return { kind: tr(board, "event.turnFailed"), text: JSON.stringify(event), danger: true };
  if (event.type === "thread.started") return { kind: "thread", text: String(event.thread_id ?? "") };
  return { kind: event.type, text: JSON.stringify(event) };
}

export function EventStream({ events }: { events: RawEvent[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = events.map(eventLine);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 60, overscan: 10 });
  if (rows.length === 0) return <p className="t-subhead py-8 text-center text-label-2">{tr(board, "event.none")}</p>;
  return (
    <div ref={parentRef} className="inset h-full overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index]!;
          return (
            <div key={v.key} ref={virtualizer.measureElement} data-index={v.index} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }} className="border-b border-separator-soft px-4 py-2.5">
              <div className="flex items-baseline gap-3">
                <span className="t-caption mono w-8 shrink-0 text-right text-label-3">{v.index + 1}</span>
                <span className={`t-footnote w-16 shrink-0 ${row.danger ? "text-red" : "text-label-2"}`}>{row.kind}</span>
                <pre className={`t-footnote mono min-w-0 flex-1 whitespace-pre-wrap break-all ${row.danger ? "text-red" : "text-label"}`}>
                  {row.text.length > 1200 ? `${row.text.slice(0, 1200)}${tr(board, "event.truncated", { n: row.text.length })}` : row.text}
                </pre>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import type { Phase, Status } from "../api";
import { common } from "../i18n/common";
import { currentLang, tr } from "./i18n";

export function statusLabel(status: Status): string {
  return tr(common, `status.${status}`);
}

export function phaseLabel(phase: Exclude<Phase, null>): string {
  return tr(common, `phase.${phase}`);
}

// Status is the only thing colour encodes, in Apple system colours.
export const STATUS_COLOR: Record<Status, { text: string; bg: string }> = {
  queued: { text: "text-yellow", bg: "bg-yellow" },
  running: { text: "text-orange", bg: "bg-orange" },
  completed: { text: "text-green", bg: "bg-green" },
  failed: { text: "text-red", bg: "bg-red" },
  cancelled: { text: "text-gray", bg: "bg-gray" },
  lost: { text: "text-indigo", bg: "bg-indigo" },
  timed_out: { text: "text-purple", bg: "bg-purple" }
};

// Worker reports are markdown. In a one-line preview the syntax is noise.
export function plain(text: string | null | undefined, max = 200): string {
  if (!text) return "";
  const t = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*\|?\s*-{2,}[-|\s:]*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const s = Math.round(Math.max(0, now - t) / 1000);
  if (s < 45) return tr(common, "justNow");
  const rtf = new Intl.RelativeTimeFormat(currentLang(), { numeric: "always" });
  const m = Math.round(s / 60);
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 36) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return tr(common, "duration.s", { s });
  const m = Math.floor(s / 60);
  if (m < 60) return tr(common, "duration.ms", { m, s: s % 60 });
  const h = Math.floor(m / 60);
  return tr(common, "duration.hm", { h, m: m % 60 });
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function shortId(id: string | null | undefined, keep = 8): string {
  if (!id) return "—";
  return id.length > keep ? id.slice(-keep) : id;
}

export function relativeToWorktree(path: string, worktree: string | null): string {
  if (worktree && path.startsWith(worktree)) return path.slice(worktree.length).replace(/^[\\/]+/, "");
  return path;
}

export function sessionLabel(id: string, unsessioned: boolean): string {
  return unsessioned ? tr(common, "unsessioned") : id;
}

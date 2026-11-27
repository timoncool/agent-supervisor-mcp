import type { stats } from "../../i18n/stats";
import type { Lang, Params } from "../../lib/i18n";
import type { DayStats, ModelStats, Slot, StatsResponse, Totals } from "./types";

type TranslateStats = (key: keyof typeof stats.en, params?: Params) => string;

export const EMPTY_TOTALS: Totals = {
  dispatched: 0,
  accepted: 0,
  acceptance_failed: 0,
  landed: 0,
  failed: 0,
  probes: 0,
  reworks: 0,
  fable: 0,
  manual_fixes: 0,
  review_ok: 0,
  lead_notes: 0,
  input_tokens: 0,
  cached_input_tokens: 0,
  output_tokens: 0,
  credits: 0,
  usd: 0
};

export function makeStatsFormatters(lang: Lang) {
  const date = new Intl.DateTimeFormat(lang, { timeZone: "UTC", day: "numeric", month: "short" });
  return {
    date: (key: string) => date.format(new Date(key)),
    number: new Intl.NumberFormat(lang).format,
    oneDecimal: new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format,
    twoDecimals: new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format,
    tokens: new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 }).format
  };
}

export type StatsFormatters = ReturnType<typeof makeStatsFormatters>;

export function periodLabel(since: string, today: string, format: StatsFormatters, t: TranslateStats) {
  return t("period", { from: format.date(since.slice(0, 10)), to: format.date(today) });
}

export function fillDays(data: StatsResponse, today: string): DayStats[] {
  const byDate = new Map(data.daily.map((row) => [row.date, row]));
  const daily: DayStats[] = [];
  const first = Date.parse(data.since.slice(0, 10));
  const last = Date.parse(today);
  for (let time = first; time <= last; time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    daily.push(byDate.get(date) ?? { ...EMPTY_TOTALS, date });
  }
  return daily;
}

export function chartSlots(daily: DayStats[], weekly: boolean, format: StatsFormatters, t: TranslateStats): Slot[] {
  const slots: Slot[] = [];
  const groupSize = weekly ? 7 : 1;
  // Full weeks are aligned to the end of the period.
  let size = daily.length % groupSize || groupSize;
  for (let start = 0; start < daily.length; start += size, size = groupSize) {
    const key = daily[start].date;
    const label = format.date(key);
    const slot: Slot = {
      key,
      label,
      title: weekly ? t("chart.weekFrom", { date: label }) : label,
      dispatched: 0,
      landed: 0,
      acceptance_failed: 0,
      fable: 0,
      reworks: 0,
      failed: 0,
      tokens: 0,
      credits: 0,
      usd: 0
    };
    for (const day of daily.slice(start, start + size)) {
      slot.dispatched += day.dispatched;
      slot.landed += day.landed;
      slot.acceptance_failed += day.acceptance_failed;
      slot.fable += day.fable;
      slot.reworks += day.reworks;
      slot.failed += day.failed;
      slot.tokens += day.input_tokens + day.output_tokens;
      slot.credits += day.credits;
      slot.usd += day.usd;
    }
    slots.push(slot);
  }
  return slots;
}

export function sortModels(byModel: StatsResponse["by_model"]) {
  return Object.entries(byModel).sort(([, a], [, b]) =>
    b.credits - a.credits || b.usd - a.usd ||
    (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)
  );
}

interface Tile {
  label: string;
  value: string;
  suffix?: string;
  detail?: string;
}

export function tileValues(data: StatsResponse, format: StatsFormatters, t: TranslateStats): Tile[] {
  const models = Object.values(data.by_model);
  const tasks = models.reduce((sum, model) => sum + model.tasks, 0);
  const landed = models.reduce((sum, model) => sum + model.landed, 0);
  const codex = models.filter((model) => model.pricing === "codex");
  const deepseek = models.filter((model) => model.pricing === "deepseek");
  const sumCodex = (field: keyof Pick<ModelStats, "input_tokens" | "cached_input_tokens" | "output_tokens">) =>
    codex.reduce((sum, model) => sum + model[field], 0);
  const input = sumCodex("input_tokens");
  const { total, first_try_acceptance_rate: rate, first_try_judged: judged } = data;
  const missing = "—";
  return [
    {
      label: t("tile.firstTry"),
      value: rate === null ? missing : `${format.number(Math.round(rate * 100))}%`,
      detail: rate === null ? t("tile.noAcceptances") : t("tile.firstTryDetail", { count: judged, n: format.number(judged) })
    },
    {
      label: t("tile.reworks"),
      value: total.lead_notes === 0 || tasks === 0 ? missing : format.oneDecimal(total.reworks / tasks),
      detail: total.lead_notes === 0 ? t("tile.noLeadNotes") : t("tile.reworksDetail", {
        n: format.number(total.reworks),
        m: format.number(total.fable)
      })
    },
    {
      label: t("series.landed"),
      value: format.number(landed),
      suffix: t("tile.ofTasks", { n: format.number(tasks) }),
      detail: t("tile.landedDetail", { n: format.number(total.acceptance_failed), m: format.number(total.failed) })
    },
    {
      label: t("tile.codexTokens"),
      value: codex.length === 0 ? missing : format.tokens(input + sumCodex("output_tokens")),
      detail: input > 0 ? t("tile.cached", { n: format.number(Math.round(sumCodex("cached_input_tokens") / input * 100)) }) : undefined
    },
    {
      label: t("tile.credits"),
      value: format.oneDecimal(total.credits),
      detail: t("tile.creditsDetail")
    },
    {
      label: t("tile.deepseek"),
      value: deepseek.length === 0
        ? missing
        : `$${format.twoDecimals(deepseek.reduce((sum, model) => sum + model.usd, 0))}`,
      detail: deepseek.length === 0 ? t("tile.noDeepseek") : undefined
    }
  ];
}

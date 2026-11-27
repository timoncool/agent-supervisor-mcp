import { stats } from "../../i18n/stats";
import { useT } from "../../lib/i18n";
import { ChartPlot } from "./ChartPlot";
import type { StatsFormatters } from "./model";
import type { Slot } from "./types";

const SERIES = [
  { field: "dispatched", swatch: "bg-(--stats-dispatched)" },
  { field: "landed", swatch: "bg-(--stats-landed)" },
  { field: "acceptance_failed", swatch: "bg-(--stats-acceptance-failed)" },
  { field: "fable", swatch: "bg-(--stats-fable)" },
  { field: "reworks", swatch: "bg-(--stats-reworks)" },
  { field: "failed", swatch: "bg-(--stats-failed)" }
] as const;

export function WorkChart({ slots, weekly, format }: { slots: Slot[]; weekly: boolean; format: StatsFormatters }) {
  const t = useT(stats);
  const title = t(weekly ? "chart.weekly" : "chart.daily");
  const count = slots.length;
  const hasWork = slots.some((slot) => SERIES.some(({ field }) => slot[field] !== 0));
  return (
    <section className="inset p-4
      [--stats-dispatched:#86b6ef] dark:[--stats-dispatched:#256abf]
      [--stats-landed:#256abf] dark:[--stats-landed:#86b6ef]
      [--stats-acceptance-failed:#eb6834] dark:[--stats-acceptance-failed:#d95926]
      [--stats-fable:#1baf7a] dark:[--stats-fable:#199e70]
      [--stats-reworks:#eda100] dark:[--stats-reworks:#c98500]
      [--stats-failed:#e87ba4] dark:[--stats-failed:#d55181]">
      <h2 className="t-headline">{title}</h2>
      <ul className="t-caption mt-2 flex flex-wrap gap-x-4 gap-y-1 text-label-2">
        {SERIES.map(({ field, swatch }) => (
          <li key={field} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 shrink-0 ${swatch}`} />
            {t(`series.${field}`)}
          </li>
        ))}
      </ul>
      {hasWork
        ? <ChartPlot slots={slots} ariaLabel={t("chart.aria", { title, count, n: format.number(count) })} />
        : <p className="t-subhead grid h-[300px] place-items-center text-center text-label-2">{t("chart.empty")}</p>}
    </section>
  );
}

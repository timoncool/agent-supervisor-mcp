import { stats } from "../../i18n/stats";
import { useT } from "../../lib/i18n";
import type { StatsFormatters } from "./model";
import type { DayStats } from "./types";

const COLUMNS = [
  "daily.date", "series.dispatched", "series.landed", "series.acceptance_failed",
  "series.failed", "daily.reworks", "series.fable", "daily.probes", "daily.tokens", "credits", "dollars"
] as const;

export function DailyTable({ daily, format }: { daily: DayStats[]; format: StatsFormatters }) {
  const t = useT(stats);
  return (
    <details className="inset p-4">
      <summary className="t-subhead cursor-pointer text-blue">{t("daily.title")}</summary>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("daily.title")}>
        <table className="tabular mt-1.5 mb-3.5 w-full border-collapse text-sm whitespace-nowrap
          [&_tr>*]:border-b-[0.5px] [&_tr>*]:border-separator [&_tr>*]:px-2.5 [&_tr>*]:py-1.5
          [&_tr>*]:text-right [&_tr>*]:align-top [&_tr>:first-child]:text-left
          [&_th]:text-[13px] [&_th]:font-semibold [&_th]:text-label-2 [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              {COLUMNS.map((key) => <th key={key} scope="col">{t(key)}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((day) => (
              <tr key={day.date}>
                <td><time dateTime={day.date}>{format.date(day.date)}</time></td>
                <td>{format.number(day.dispatched)}</td>
                <td>{format.number(day.landed)}</td>
                <td>{format.number(day.acceptance_failed)}</td>
                <td>{format.number(day.failed)}</td>
                <td>{format.number(day.reworks)}</td>
                <td>{format.number(day.fable)}</td>
                <td>{format.number(day.probes)}</td>
                <td>{format.tokens(day.input_tokens + day.output_tokens)}</td>
                <td>{format.oneDecimal(day.credits)}</td>
                <td>{format.twoDecimals(day.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

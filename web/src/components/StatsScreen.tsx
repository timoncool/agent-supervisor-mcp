import { useMemo, useState } from "react";
import { Tabs } from "@base-ui-components/react/tabs";
import { ApiError } from "../api";
import { stats } from "../i18n/stats";
import { useLang, useT } from "../lib/i18n";
import { Segmented } from "./Segmented";
import { DailyTable } from "./stats/DailyTable";
import { ModelTable } from "./stats/ModelTable";
import { Tiles } from "./stats/Tiles";
import { WorkChart } from "./stats/WorkChart";
import { chartSlots, fillDays, makeStatsFormatters, periodLabel, tileValues } from "./stats/model";
import { useStats } from "./stats/useStats";
import type { StatsResponse } from "./stats/types";

const PERIODS = [7, 30, 90] as const;
const STORAGE_KEY = "csv.stats.days";

function parseDays(value: unknown) {
  return PERIODS.find((days) => String(days) === value);
}

function readDays() {
  try {
    return parseDays(localStorage.getItem(STORAGE_KEY)) ?? 30;
  } catch {
    return 30;
  }
}

function StatsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 @[640px]:grid-cols-3 @[1000px]:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="inset space-y-2 p-4">
            <div className="h-3 w-3/4 animate-pulse rounded bg-fill" />
            <div className="h-7 w-1/2 animate-pulse rounded bg-fill" />
            <div className="h-3 w-full animate-pulse rounded bg-fill" />
          </div>
        ))}
      </div>
      <div className="inset space-y-3 p-4">
        <div className="h-4 w-36 animate-pulse rounded bg-fill" />
        <div className="h-[300px] animate-pulse rounded bg-fill" />
      </div>
      <div className="inset space-y-3 p-4">
        <div className="h-4 w-28 animate-pulse rounded bg-fill" />
        <div className="h-16 animate-pulse rounded bg-fill" />
      </div>
      <div className="inset p-4">
        <div className="h-4 w-36 animate-pulse rounded bg-fill" />
      </div>
    </div>
  );
}

export function StatsScreen() {
  const t = useT(stats);
  const { lang } = useLang();
  const format = useMemo(() => makeStatsFormatters(lang), [lang]);
  const [days, setDays] = useState(readDays);
  const [lastData, setLastData] = useState<StatsResponse>();
  const query = useStats(days);

  // A failed fetch for a new key clears React Query's placeholder.
  if (query.data && !query.isPlaceholderData && query.data !== lastData) {
    setLastData(query.data);
  }
  const data = query.data ?? lastData;
  const dimmed = query.isPlaceholderData || (query.isPending && data?.days !== days);
  const today = new Date().toISOString().slice(0, 10);
  const period = String(days);
  const switchPeriod = (value: unknown) => {
    const next = parseDays(value);
    if (next === undefined) return;
    setDays(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // A blocked store does not prevent changing the period for this visit.
    }
  };
  const error = query.error;
  const oldServer = error instanceof ApiError && error.status === 404;
  const errorMessage = error instanceof ApiError ? "HTTP " + error.status : error?.message;
  const daily = data ? fillDays(data, today) : undefined;
  const weekly = data?.days === 90;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6 @container">
        <Tabs.Root value={period} onValueChange={switchPeriod}>
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="t-title2">{t("title")}</h1>
              {data && <p className="t-footnote text-label-2">{periodLabel(data.since, today, format, t)}</p>}
            </div>
            <div className="w-[240px] max-w-full">
              <Segmented value={period} segments={PERIODS.map((n) => ({ value: String(n), label: t(`days.${n}`) }))} />
            </div>
          </header>

          <Tabs.Panel value={period} className="mt-4 space-y-4" aria-busy={!data && query.isPending}>
            {errorMessage !== undefined && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p role="status" className={data ? "t-footnote text-red" : "t-subhead text-red"}>
                  {data ? t("error.refresh", { message: errorMessage }) :
                    oldServer ? t("error.oldServer") : t("error.load", { message: errorMessage })}
                </p>
                <button type="button" className="t-subhead cursor-pointer text-blue" onClick={() => void query.refetch()}>
                  {t("retry")}
                </button>
              </div>
            )}
            {!data && query.isPending && <StatsSkeleton />}
            {data && daily && (
              <div className={`space-y-4 ${dimmed ? "opacity-60" : ""}`}>
                <Tiles tiles={tileValues(data, format, t)} />
                <WorkChart slots={chartSlots(daily, weekly, format, t)} weekly={weekly} format={format} />
                <ModelTable byModel={data.by_model} format={format} />
                <DailyTable daily={daily} format={format} />
              </div>
            )}
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </div>
  );
}

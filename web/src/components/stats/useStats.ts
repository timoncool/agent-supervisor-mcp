import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { StatsResponse } from "./types";

export class StatsError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "StatsError";
    this.status = status;
  }
}

export function useStats(days: 7 | 30 | 90) {
  return useQuery({
    queryKey: ["stats", days],
    queryFn: async ({ signal }): Promise<StatsResponse> => {
      const response = await fetch("/api/stats?days=" + days, {
        signal,
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new StatsError(response.status);
      return (await response.json()) as StatsResponse;
    },
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => !(error instanceof StatsError && error.status >= 400 && error.status < 500) && failureCount < 1,
    refetchInterval: 30_000
  });
}

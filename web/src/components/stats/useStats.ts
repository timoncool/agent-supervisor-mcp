import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, retryUnlessClientError } from "../../api";
import type { StatsResponse } from "./types";

export function useStats(days: 7 | 30 | 90) {
  return useQuery({
    queryKey: ["stats", days],
    queryFn: async ({ signal }): Promise<StatsResponse> => {
      const path = "/api/stats?days=" + days;
      const response = await fetch(path, {
        signal,
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new ApiError(response.status, path);
      return (await response.json()) as StatsResponse;
    },
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    refetchInterval: 30_000
  });
}

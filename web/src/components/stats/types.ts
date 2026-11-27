export type Pricing = "codex" | "deepseek" | "unpriced";

export interface DayStats {
  date: string;
  dispatched: number;
  accepted: number;
  acceptance_failed: number;
  landed: number;
  failed: number;
  probes: number;
  reworks: number;
  fable: number;
  manual_fixes: number;
  review_ok: number;
  lead_notes: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  credits: number;
  usd: number;
}

export type Totals = Omit<DayStats, "date">;

export interface ModelStats {
  pricing: Pricing;
  tasks: number;
  landed: number;
  runs: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  credits: number;
  usd: number;
}

export interface StatsResponse {
  days: number;
  since: string;
  daily: DayStats[];
  total: Totals;
  first_try_acceptance_rate: number | null;
  first_try_judged: number;
  by_model: Record<string, ModelStats>;
}

export interface Slot {
  key: string;
  label: string;
  title: string;
  dispatched: number;
  landed: number;
  acceptance_failed: number;
  fable: number;
  reworks: number;
  failed: number;
  tokens: number;
  credits: number;
  usd: number;
}

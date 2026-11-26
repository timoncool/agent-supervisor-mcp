// Daily figures for the board's summary: how much work went through workers,
// how much of it held up, what it cost. Read from the ledger the supervisor
// already keeps; nothing is stored twice.
import { openDb } from "./db.js";

// Codex credits per 1M tokens (input, cached input, output); OpenAI rate card.
const CREDIT_RATES = {
  "gpt-6.2-astra": [200, 10, 1000],
  "gpt-6.2-sol": [50, 2.5, 250],
  "gpt-6.1-sol": [50, 2.5, 250],
  "gpt-6.1-terra": [25, 1.25, 125],
  "gpt-6-sol": [50, 5, 250],
  "gpt-6-luna": [2.5, 0.25, 12.5],
  "gpt-5.6-sol": [100, 10, 500]
};
// DeepSeek dollars per 1M tokens at peak (input, cached input, output).
const DEEPSEEK_USD = { "deepseek/deepseek-flash": [0.3, 0.006, 1.2] };

const day = (iso) => String(iso ?? "").slice(0, 10);

function costOf(model, usage) {
  const input = Number(usage?.input_tokens ?? 0);
  const cached = Math.min(Number(usage?.cached_input_tokens ?? 0), input);
  const output = Number(usage?.output_tokens ?? 0);
  const fresh = input - cached;
  const credit = CREDIT_RATES[model];
  if (credit) return { credits: (fresh * credit[0] + cached * credit[1] + output * credit[2]) / 1e6, usd: 0 };
  const dollars = DEEPSEEK_USD[model];
  if (dollars) return { credits: 0, usd: (fresh * dollars[0] + cached * dollars[1] + output * dollars[2]) / 1e6 };
  return { credits: 0, usd: 0 };
}

function emptyDay(date) {
  return {
    date, dispatched: 0, accepted: 0, acceptance_failed: 0, landed: 0, failed: 0,
    reworks: 0, fable: 0, manual_fixes: 0, review_ok: 0,
    input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, usd: 0
  };
}

export function workerStats({ days = 30, now = new Date() } = {}) {
  const db = openDb();
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const byDay = new Map();
  const at = (date) => {
    if (!byDay.has(date)) byDay.set(date, emptyDay(date));
    return byDay.get(date);
  };
  const tasks = db.prepare("SELECT id, model, status, created_at, updated_at, run_count, landed_at FROM tasks WHERE created_at >= ?").all(since);
  const modelOf = new Map(tasks.map((task) => [task.id, task.model ?? "default"]));
  const byModel = {};
  for (const task of tasks) {
    at(day(task.created_at)).dispatched += 1;
    if (["failed", "lost", "timed_out"].includes(task.status)) at(day(task.updated_at)).failed += 1;
    const model = task.model ?? "default";
    byModel[model] ??= { tasks: 0, landed: 0, runs: 0, input_tokens: 0, output_tokens: 0, credits: 0, usd: 0 };
    byModel[model].tasks += 1;
    byModel[model].runs += Number(task.run_count ?? 0);
    if (task.landed_at) byModel[model].landed += 1;
  }
  const events = db.prepare(`
    SELECT task_id, created_at, event_type, payload FROM task_events
    WHERE created_at >= ? AND (event_type IN ('supervisor.acceptance', 'supervisor.landed', 'turn.completed') OR event_type LIKE 'lead.%')
  `).all(since);
  const firstAcceptance = new Map();
  for (const event of events) {
    const bucket = at(day(event.created_at));
    let payload = {};
    try {
      payload = JSON.parse(event.payload);
    } catch {
      // a payload stored as a log reference has no inline fields to count
    }
    if (event.event_type === "supervisor.acceptance") {
      if (payload.passed === true) bucket.accepted += 1;
      else if (payload.status === "failed") bucket.acceptance_failed += 1;
      if (!firstAcceptance.has(event.task_id)) firstAcceptance.set(event.task_id, payload.passed === true);
    } else if (event.event_type === "supervisor.landed") {
      bucket.landed += 1;
    } else if (event.event_type === "turn.completed") {
      const usage = payload.usage ?? {};
      const model = modelOf.get(event.task_id) ?? "default";
      const cost = costOf(model, usage);
      bucket.input_tokens += Number(usage.input_tokens ?? 0);
      bucket.cached_input_tokens += Number(usage.cached_input_tokens ?? 0);
      bucket.output_tokens += Number(usage.output_tokens ?? 0);
      bucket.credits += cost.credits;
      bucket.usd += cost.usd;
      if (byModel[model]) {
        byModel[model].input_tokens += Number(usage.input_tokens ?? 0);
        byModel[model].output_tokens += Number(usage.output_tokens ?? 0);
        byModel[model].credits += cost.credits;
        byModel[model].usd += cost.usd;
      }
    } else if (event.event_type === "lead.rework") bucket.reworks += 1;
    else if (event.event_type === "lead.fable") bucket.fable += 1;
    else if (event.event_type === "lead.manual_fix") bucket.manual_fixes += 1;
    else if (event.event_type === "lead.review_ok") bucket.review_ok += 1;
  }
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const total = daily.reduce((sum, row) => {
    for (const key of Object.keys(row)) if (key !== "date") sum[key] = (sum[key] ?? 0) + row[key];
    return sum;
  }, {});
  const judged = [...firstAcceptance.values()];
  return {
    days,
    since,
    daily,
    total,
    first_try_acceptance_rate: judged.length > 0 ? judged.filter(Boolean).length / judged.length : null,
    by_model: byModel
  };
}

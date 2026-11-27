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

function pricing(model) {
  if (CREDIT_RATES[model]) return "codex";
  if (DEEPSEEK_USD[model]) return "deepseek";
  return "unpriced";
}

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
    probes: 0, reworks: 0, fable: 0, manual_fixes: 0, review_ok: 0, lead_notes: 0,
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
  const tasks = db.prepare("SELECT id, model, status, created_at, updated_at, run_count, landed_at, json_extract(guard_policy, '$.preflight') AS preflight FROM tasks WHERE created_at >= ?").all(since);
  const byModel = {};
  const modelRow = (model) => {
    byModel[model] ??= { pricing: pricing(model), tasks: 0, landed: 0, runs: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, usd: 0 };
    return byModel[model];
  };
  for (const task of tasks) {
    // A preflight probe proves the environment; it is not work. Its tokens
    // still count below, since they are spent all the same.
    if (task.preflight) {
      at(day(task.created_at)).probes += 1;
      continue;
    }
    at(day(task.created_at)).dispatched += 1;
    if (["failed", "lost", "timed_out"].includes(task.status)) at(day(task.updated_at)).failed += 1;
    const model = task.model ?? "default";
    modelRow(model).tasks += 1;
    byModel[model].runs += Number(task.run_count ?? 0);
    if (task.landed_at) byModel[model].landed += 1;
  }
  // The model comes from the task itself, so turns of a task dispatched
  // before the window still count against the right rate.
  const events = db.prepare(`
    SELECT e.task_id, e.created_at, e.event_type, e.payload, t.model FROM task_events e LEFT JOIN tasks t ON t.id = e.task_id
    WHERE e.created_at >= ? AND (e.event_type IN ('supervisor.acceptance', 'supervisor.landed', 'turn.completed') OR e.event_type LIKE 'lead.%')
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
      const passed = payload.passed === true;
      const failed = !passed && payload.status === "failed";
      if (passed) bucket.accepted += 1;
      else if (failed) bucket.acceptance_failed += 1;
      // A cancelled or interrupted run is no verdict on the work.
      if ((passed || failed) && !firstAcceptance.has(event.task_id)) firstAcceptance.set(event.task_id, passed);
    } else if (event.event_type === "supervisor.landed") {
      bucket.landed += 1;
    } else if (event.event_type === "turn.completed") {
      const usage = payload.usage ?? {};
      const model = event.model ?? "default";
      const cost = costOf(model, usage);
      const row = modelRow(model);
      for (const target of [bucket, row]) {
        target.input_tokens += Number(usage.input_tokens ?? 0);
        target.cached_input_tokens += Number(usage.cached_input_tokens ?? 0);
        target.output_tokens += Number(usage.output_tokens ?? 0);
        target.credits += cost.credits;
        target.usd += cost.usd;
      }
    } else {
      bucket.lead_notes += 1;
      if (event.event_type === "lead.rework") bucket.reworks += 1;
      else if (event.event_type === "lead.fable") bucket.fable += 1;
      else if (event.event_type === "lead.manual_fix") bucket.manual_fixes += 1;
      else if (event.event_type === "lead.review_ok") bucket.review_ok += 1;
    }
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
    first_try_judged: judged.length,
    by_model: byModel
  };
}

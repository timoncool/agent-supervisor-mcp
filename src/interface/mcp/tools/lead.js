import { z } from "zod";
import { appendTaskEvent } from "../../../infra/store/events.js";
import { getTask } from "../../../infra/store/tasks.js";
import { defineTool } from "./run.js";

// The lead's own decisions about a worker, which the supervisor cannot see:
// they land in the same event ledger and feed the board's summary.
export const noteWorkerTool = defineTool("note_worker", {
  title: "Record a lead decision about a worker",
  description: "Record what the lead decided about a worker: review_ok (diff reviewed and accepted), rework (sent back, say why), fable (asked a stronger reviewer, say what for), manual_fix (fixed it yourself), note. Call it after each such decision; the board's summary counts them.",
  inputSchema: {
    task_id: z.string(),
    kind: z.enum(["review_ok", "rework", "fable", "manual_fix", "note"]),
    text: z.string().max(2000).optional(),
    acceptance_waived: z.string().min(10).max(500).optional()
  }
}, async ({ task_id, kind, text, acceptance_waived }) => {
  const task = await getTask(task_id);
  if (!task) return { error: "task_not_found", task_id };
  if (kind === "review_ok" && task.acceptance_results?.passed !== true && acceptance_waived === undefined) {
    return {
      error: "acceptance_not_passed",
      task_id,
      acceptance: task.acceptance_results?.status ?? "none",
      message: "review_ok needs passed acceptance; read get_worker include result, or give acceptance_waived with the reason"
    };
  }
  const event = { type: `lead.${kind}`, text: text ?? null };
  if (acceptance_waived !== undefined) event.acceptance_waived = acceptance_waived;
  await appendTaskEvent(task_id, event, { actor: "lead" });
  return { recorded: true, task_id, kind };
});

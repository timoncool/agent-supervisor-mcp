import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { dispatchArgs, tempHome, waitFor, withMcp, startWebServer } from "./helpers.js";

test("note_worker records lead decisions and the stats endpoint counts them", async () => {
  const home = await tempHome("supervisor-lead-stats-");
  await withMcp({ SUPERVISOR_HOME: home }, async ({ call }) => {
    const created = await call("create_worker", dispatchArgs("stats", join(home, "workspace")));
    assert.ok(created.id, JSON.stringify(created));
    await waitFor(call, created.id, (row) => ["completed", "failed"].includes(row.status));

    assert.deepEqual(await call("note_worker", { task_id: created.id, kind: "rework", text: "missing edge case" }),
      { recorded: true, task_id: created.id, kind: "rework" });
    await call("note_worker", { task_id: created.id, kind: "fable", text: "second opinion on the API shape" });
    await call("note_worker", { task_id: created.id, kind: "review_ok" });
    const missing = await call("note_worker", { task_id: "codex-none", kind: "note" });
    assert.equal(missing.error, "task_not_found");
  });

  const web = await startWebServer({ SUPERVISOR_HOME: home });
  try {
    const { status, body } = await web.get("/api/stats?days=7");
    assert.equal(status, 200);
    assert.equal(body.days, 7);
    assert.equal(body.total.dispatched, 1);
    assert.equal(body.total.reworks, 1);
    assert.equal(body.total.fable, 1);
    assert.equal(body.total.review_ok, 1);
    assert.equal(body.total.lead_notes, 3);
    assert.equal(typeof body.first_try_judged, "number");
    const models = Object.values(body.by_model);
    assert.equal(models.length, 1);
    assert.equal(models[0].tasks, 1);
    assert.ok("cached_input_tokens" in models[0] && "pricing" in models[0]);
    assert.ok(body.daily.length >= 1);
  } finally {
    await web.close();
  }
});

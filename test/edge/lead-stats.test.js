import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { dispatchArgs, tempHome, waitFor, withMcp, startWebServer } from "./helpers.js";

test("note_worker records lead decisions and the stats endpoint counts them", async () => {
  const home = await tempHome("supervisor-lead-stats-");
  await withMcp({ SUPERVISOR_HOME: home }, async ({ call }) => {
    const created = await call("create_worker", dispatchArgs("stats", join(home, "workspace"), {
      acceptance: { commands: "true" }
    }));
    assert.ok(created.id, JSON.stringify(created));
    const done = await waitFor(call, created.id, (row) => Number.isInteger(row.exit_code));
    assert.equal(done.acceptance, "passed");

    assert.deepEqual(await call("note_worker", { task_id: created.id, kind: "rework", text: "missing edge case" }),
      { recorded: true, task_id: created.id, kind: "rework" });
    await call("note_worker", { task_id: created.id, kind: "fable", text: "second opinion on the API shape" });
    assert.deepEqual(await call("note_worker", { task_id: created.id, kind: "review_ok" }),
      { recorded: true, task_id: created.id, kind: "review_ok" });
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

test("note_worker requires a reason to waive acceptance for review_ok", async () => {
  const home = await tempHome("supervisor-lead-waiver-");
  await withMcp({ SUPERVISOR_HOME: home }, async ({ call }) => {
    const created = await call("create_worker", dispatchArgs("unchecked-review", join(home, "workspace")));
    assert.ok(created.id, JSON.stringify(created));
    await waitFor(call, created.id, (row) => ["completed", "failed"].includes(row.status));

    const review = { task_id: created.id, kind: "review_ok" };
    const eventQuery = { task_id: created.id, include: ["events"], event_kinds: ["lead.review_ok", "lead.rework"] };
    const refused = await call("note_worker", review);
    assert.equal(refused.error, "acceptance_not_passed");
    assert.equal(refused.acceptance, "none");
    assert.deepEqual((await call("get_worker", eventQuery)).events, []);

    const acceptance_waived = "Validated against the release checklist manually";
    assert.deepEqual(await call("note_worker", { ...review, acceptance_waived }), { recorded: true, ...review });
    assert.deepEqual(await call("note_worker", { task_id: created.id, kind: "rework", text: "fix edge case" }),
      { recorded: true, task_id: created.id, kind: "rework" });
    assert.deepEqual((await call("get_worker", eventQuery)).events, [
      { type: "lead.review_ok", text: null, acceptance_waived },
      { type: "lead.rework", text: "fix edge case" }
    ]);
  });
});

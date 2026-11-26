// This fork never asks a package registry: the overview names the installed
// version, and the dispatch receipt and wait response carry no update notice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { dispatchArgs, packageVersion, tempHome, withMcp } from "./helpers.js";

test("the overview reports the installed version from disk and nothing else", async () => {
  const home = await tempHome("supervisor-mcp-update-");
  await withMcp({ SUPERVISOR_HOME: home }, async ({ call }) => {
    const deadline = Date.now() + 8000;
    let overview;
    for (;;) {
      overview = await call("poll_workers", {});
      if (overview.update.checked !== "pending") break;
      assert.ok(Date.now() < deadline, "the local version read never finished");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(overview.version, packageVersion);
    assert.equal(overview.update.update_available, false);
    assert.equal(overview.update.installed_version, packageVersion);
    assert.equal(overview.update.checked, "local");

    const created = await call("create_worker", dispatchArgs("quiet", join(home, "workspace")));
    assert.ok(created.id, JSON.stringify(created));
    assert.equal("update" in created, false, "no notice in the dispatch receipt");
    const waited = await call("wait_workers", { task_ids: [created.id], timeout_ms: 10000 });
    assert.equal("update" in waited, false, "no notice in the wait response");
  });
});

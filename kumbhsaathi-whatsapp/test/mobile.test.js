const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function mobileModule(file, supabase, exports) {
  const source = fs.readFileSync(path.join(__dirname, "../../kumbhsaathi-mobile/src", file), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
  const context = { supabase, hasSupabaseConfig: true, volunteerName: "test-volunteer", demoTasks: [] };
  vm.runInNewContext(source + `\nthis.api = { ${exports.join(",")} };`, context);
  return context.api;
}
test("mobile mark-found and task status propagate database failures", async () => {
  const failure = new Error("write denied");
  const api = mobileModule("tasksApi.js", { rpc: async () => ({ error: failure }) }, ["reportTaskFound", "updateTaskStatus"]);
  await assert.rejects(api.reportTaskFound({ id: "case-test", case_id: "test", is_live_case_only: true }, null), /write denied/);
  await assert.rejects(api.updateTaskStatus({ id: "task-test" }, "accepted"), /write denied/);
});
test("mobile retries reuse the case request ID and never pretend a failed save succeeded", async () => {
  const calls = [];
  const api = mobileModule("mobileApi.js", { rpc: async (name, args) => {
    calls.push({ name, args }); return { error: new Error("network unavailable") };
  } }, ["submitEmergencyAlert", "submitTrustCheck"]);
  await assert.rejects(api.submitEmergencyAlert({ gpsLocation: null }), /network unavailable/);
  await assert.rejects(api.submitEmergencyAlert({ gpsLocation: null }), /network unavailable/);
  assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id);
  assert.equal(calls[0].args.p_report.risk_flags.includes("location_attached"), false);
  await assert.rejects(api.submitTrustCheck({ message: "check this" }), /network unavailable/);
});

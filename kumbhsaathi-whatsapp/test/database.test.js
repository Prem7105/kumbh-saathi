const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm");

test("database roles, idempotency and transactional failure handling", async t => {
  const db = new PGlite({ extensions: { pg_trgm } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  const schema = readFileSync(path.join(__dirname, "../../kumbhsaathi-shared/supabase-schema.sql"), "utf8");
  await db.exec(schema);
  const migration = readFileSync(path.join(__dirname, "../../kumbhsaathi-shared/security-hardening.sql"), "utf8");
  assert.ok(schema.endsWith(migration));
  await db.exec(`create policy demo_read_live_cases on live_cases for select to anon using (true);
    create policy demo_update_live_cases on live_cases for update to anon using (true);
    grant select, insert, update on live_cases to anon;`);
  await db.exec(migration); // Upgrade removes old policies and can be reapplied safely.
  const uid = "10000000-0000-0000-0000-000000000001";
  async function role(name, staff, id = uid) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: name, sub: id, app_metadata: { staff_role: staff } })]);
    await db.exec(`set role ${name}`);
  }
  await role("anon");
  await assert.rejects(db.query("select * from live_cases"), /permission denied/);
  await assert.rejects(db.query("select * from official_missing_persons"), /permission denied/);
  await assert.rejects(db.query("select * from audit_logs"), /permission denied/);
  await assert.rejects(db.query("select * from search_official_cases('child', 5)"), /permission denied/);

  await role("service_role");
  const payload = { source: "whatsapp", missing_person_name: "Test person", priority: "high" };
  const create = (body, id) => db.query("select * from create_intake_case($1::jsonb, $2)", [JSON.stringify(body), id]);
  const original = (await create(payload, "SM-test")).rows[0];
  const retry = (await create(payload, "SM-test")).rows[0];
  assert.equal(original.id, retry.id);
  assert.equal((await db.query("select count(*)::int as n from live_cases")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from case_updates")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from audit_logs")).rows[0].n, 1);

  await role("authenticated", "");
  assert.equal((await db.query("select * from live_cases")).rows.length, 0);
  await assert.rejects(create({ source: "mobile_app" }, "unauthorised"), /Staff|staff/);
  await assert.rejects(db.query("select report_person_found($1)", [original.id]), /Staff access/);

  await role("authenticated", "volunteer");
  assert.equal((await db.query("select * from live_cases")).rows.length, 1);
  assert.equal((await db.query("select * from cctv_locations")).rows.length, 0);
  assert.equal((await db.query("select * from audit_logs")).rows.length, 0);
  await assert.rejects(create(payload, "forged-source"), /Mobile staff/);
  const mobile = (await create({ source: "mobile_app", raw_report: "Test SOS", priority: "critical" }, "mobile-test")).rows[0];
  const task = (await db.query("select * from volunteer_tasks where case_id = $1", [mobile.id])).rows[0];
  assert.equal(task.assigned_to, uid);
  assert.ok((await db.query("select submit_trust_report('Please check this report') as id")).rows[0].id);
  await assert.rejects(db.query("update audit_logs set actor = 'forged'"), /permission denied/);
  const progress = await db.query("select * from update_volunteer_task($1, 'accepted')", [task.id]);
  assert.equal(progress.rows[0].status, "accepted");
  await role("authenticated", "volunteer", "20000000-0000-0000-0000-000000000002");
  await assert.rejects(db.query("select report_person_found($1, $2)", [mobile.id, task.id]), /another volunteer/);
  await assert.rejects(db.query("select * from update_volunteer_task($1, 'completed')", [task.id]), /another volunteer/);

  // Inject a real database failure into the final audit write.
  await db.exec("reset role");
  await db.exec(`create function reject_test_audit() returns trigger language plpgsql as $$ begin raise exception 'forced audit failure'; end $$;
    create trigger fail_audit before insert on audit_logs for each row execute function reject_test_audit();`);
  await role("service_role");
  await assert.rejects(create(payload, "must-rollback"), /forced audit failure/);
  assert.equal((await db.query("select * from live_cases where external_case_id = 'must-rollback'")).rows.length, 0);
  await role("authenticated", "volunteer");
  await assert.rejects(db.query("select report_person_found($1, $2)", [mobile.id, task.id]), /forced audit failure/);
  assert.equal((await db.query("select status from live_cases where id=$1", [mobile.id])).rows[0].status, "open");
  assert.equal((await db.query("select status from volunteer_tasks where id=$1", [task.id])).rows[0].status, "accepted");
  await db.exec("reset role; drop trigger fail_audit on audit_logs");
  await role("authenticated", "volunteer");
  await db.query("select report_person_found($1, $2)", [mobile.id, task.id]);
  assert.equal((await db.query("select status from live_cases where id=$1", [mobile.id])).rows[0].status, "found");
  assert.equal((await db.query("select status from volunteer_tasks where id=$1", [task.id])).rows[0].status, "completed");
  await role("authenticated", "organiser");
  assert.ok((await db.query("select * from audit_logs")).rows.length > 0);
});

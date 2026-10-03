// Integration test: runs the real SQL against an in-memory Postgres (PGlite) and
// checks leaderboard maths agrees with the pure scoreDay() function.
process.env.PGLITE_DIR = "memory";

import { test } from "node:test";
import assert from "node:assert/strict";
import { q } from "./db";
import { recordSteps, addActivity } from "./entries";
import { peopleLeaderboard, teamLeaderboard, userDays, myRank } from "./queries";
import { scoreDay } from "./scoring";

const range: [string, string] = ["2026-10-01", "2026-10-31"];

test("SQL leaderboard matches scoreDay and ranks teams", async () => {
  await q("INSERT INTO teams (id, name, name_key, invite_code) VALUES ('t1','Sole Mates','solemates','AAAAAA'),('t2','Lone Wolf','lonewolf','BBBBBB')");
  for (const [id, name, team] of [["a", "Ana", "t1"], ["b", "Ben", "t1"], ["c", "Cy", "t2"]])
    await q("INSERT INTO users (id, display_name, onboarded, team_id) VALUES ($1, $2, true, $3)", [id, name, team]);

  await recordSteps("a", "2026-10-01", "manual", 8000);
  await recordSteps("a", "2026-10-01", "apple_health", 10_200); // max wins → bonus
  await addActivity("a", "2026-10-01", "moderate", 30, "Bike");
  await recordSteps("a", "2026-10-02", "garmin", 5000);
  await addActivity("b", "2026-10-02", "heavy", 45, "HIIT"); // exercise only, no steps
  await recordSteps("c", "2026-10-01", "manual", 70_000); // capped
  await recordSteps("c", "2026-09-30", "manual", 9999); // outside challenge

  const expectA = scoreDay([8000, 10_200], [{ intensity: "moderate", minutes: 30 }]).total + scoreDay([5000], []).total;
  const expectB = scoreDay([], [{ intensity: "heavy", minutes: 45 }]).total;
  const expectC = scoreDay([70_000], []).total;

  const people = await peopleLeaderboard({ range });
  const pts = Object.fromEntries(people.map((p) => [p.id, p.points]));
  assert.equal(pts.a, expectA);
  assert.equal(pts.b, expectB);
  assert.equal(pts.c, expectC);
  assert.deepEqual(people.map((p) => p.rank), [1, 2, 3]);

  const days = await userDays("a");
  assert.equal(days.length, 2);
  assert.equal(days[0].bonus, 500);

  const teams = await teamLeaderboard({ range });
  const t1 = teams.find((t) => t.id === "t1")!;
  assert.equal(t1.points, expectA + expectB);
  assert.equal(t1.members, 2);
  const byAvg = await teamLeaderboard({ range, sort: "avg" });
  assert.equal(byAvg[0].id, (expectA + expectB) / 2 > expectC ? "t1" : "t2");

  const today = await peopleLeaderboard({ range: ["2026-10-02", "2026-10-02"] });
  assert.deepEqual(today.map((p) => p.id).sort(), ["a", "b"]);

  const r = await myRank("b", range);
  assert.ok(r && r.of === 3);
});

test("exercise minutes are capped per day", async () => {
  await q("INSERT INTO users (id, display_name, onboarded) VALUES ('d','Dee',true)");
  assert.ok((await addActivity("d", "2026-10-03", "light", 200, null)).ok);
  assert.equal((await addActivity("d", "2026-10-03", "light", 41, null)).ok, false);
  assert.ok((await addActivity("d", "2026-10-03", "light", 40, null)).ok);
});

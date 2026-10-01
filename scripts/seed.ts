// Local preview data ONLY. Refuses to run against a real database so fake
// walkers never end up on the live leaderboard.
if (process.env.DATABASE_URL) {
  console.error("Refusing to seed: DATABASE_URL is set. Seed data is for local previews only.");
  process.exit(1);
}

import { randomUUID } from "node:crypto";
import { q } from "../src/lib/db";
import { recordSteps, addActivity } from "../src/lib/entries";
import { CHALLENGE } from "../src/lib/config";
import { addDays, todayIn } from "../src/lib/dates";

const NAMES = ["Aiko", "Mateo", "Priya", "Lars", "Amara", "Chen Wei", "Sofia", "Kwame", "Noah", "Leila", "Diego", "Hana", "Olu", "Freya", "Ravi", "Zara", "Tomás", "Ingrid", "Yusuf", "Mila", "Trailblazer", "StepWolf", "Sir Steps-a-Lot", "PumpkinSpiceLegs", "Kai", "Elif", "Jonas", "Ama", "Lucía", "Arjun"];
const COUNTRIES = ["JP", "MX", "IN", "SE", "NG", "CN", "ES", "GH", "US", "IR", "AR", "KR", "NG", "NO", "IN", "GB", "BR", "DE", "TR", "PL", "CA", "AU", "NZ", "US", "US", "TR", "DE", "GH", "CO", "IN"];
const AVATARS = ["🦊", "🐻", "🦉", "🐿️", "🦔", "🐢", "🐇", "🦌", "🍂", "🍁", "🎃", "🌰", "⭐", "🔥", "⚡", "🏃", "🚶‍♀️", "🏃‍♀️"];
const TEAMS = [
  ["The Sole Mates", "👟", "pumpkin", "Leaf it all on the trail"],
  ["Maple Leafs", "🍁", "maple", "Fall forward"],
  ["Night Owls", "🦉", "plum", "Steps after dark"],
  ["Trail Foxes", "🦊", "gold", null],
  ["Pine Pacers", "🌲", "forest", "Rooted. Relentless."],
  ["Sky Striders", "🚀", "sky", null],
];

const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a));

async function main() {
  const teamIds: string[] = [];
  for (const [i, [name, emoji, color, motto]] of TEAMS.entries()) {
    const id = randomUUID();
    teamIds.push(id);
    await q(
      "INSERT INTO teams (id, name, name_key, emoji, color, motto, invite_code) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
      [id, name, name!.toLowerCase().replace(/[^a-z0-9]/g, ""), emoji, color, motto, `DEMO0${i}`],
    );
  }
  const end = todayIn("UTC") < CHALLENGE.end ? todayIn("UTC") : CHALLENGE.end;
  for (const [i, name] of NAMES.entries()) {
    const id = randomUUID();
    const team = i < 24 ? teamIds[i % teamIds.length] : null;
    await q(
      "INSERT INTO users (id, display_name, name_mode, avatar, country, onboarded, team_id) VALUES ($1,$2,$3,$4,$5,true,$6)",
      [id, name, i >= 20 && i < 24 ? "nickname" : "real", AVATARS[i % AVATARS.length], COUNTRIES[i], team],
    );
    if (team) await q("UPDATE teams SET captain_id = COALESCE(captain_id, $1) WHERE id = $2", [id, team]);
    const keen = Math.random();
    for (let d = CHALLENGE.start; d <= end; d = addDays(d, 1)) {
      if (Math.random() < 0.12) continue;
      await recordSteps(id, d, (["manual", "apple_health", "garmin", "google"] as const)[i % 4], rnd(3000, 9000 + keen * 9000));
      if (Math.random() < 0.4) await addActivity(id, d, (["light", "moderate", "heavy"] as const)[rnd(0, 3)], rnd(15, 60), null);
    }
  }
  console.log(`Seeded ${NAMES.length} walkers and ${TEAMS.length} teams.`);
}

main().then(() => process.exit(0));

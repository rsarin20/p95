import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { CHALLENGE } from "@/lib/config";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="October 3, 2026">
      <p>
        {CHALLENGE.name} is a free step-and-exercise challenge. This page explains what we collect, why, and how to delete it.
        We keep it short because we collect very little.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li><b>From your sign-in provider</b> (Google, Apple or Facebook): your name, email address and profile picture. Used only to sign you in and pre-fill your name.</li>
        <li><b>What you choose to share:</b> your public display name (real name or nickname), avatar emoji, country, and time zone.</li>
        <li><b>Activity you log or sync:</b> daily step totals and workouts (intensity, minutes and an optional label).</li>
        <li><b>Team membership</b> and the team details you create.</li>
        <li><b>Connected trackers:</b> if you connect Google or Garmin, we store an access token (encrypted) so we can read your daily step totals. We read daily step counts only.</li>
      </ul>
      <h2>What is public</h2>
      <p>
        Your display name, avatar, country flag, team, and point and step totals appear on the leaderboards. Your email address and
        sign-in account are never shown to anyone.
      </p>
      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell or rent your data, and we don&apos;t show ads.</li>
        <li>We don&apos;t read health data beyond daily step totals.</li>
        <li>We don&apos;t post anything to your Google, Apple or Facebook account.</li>
      </ul>
      <h2>Where it lives</h2>
      <p>The app is hosted on Vercel and the data is stored in a managed Postgres database (Neon). Both use encryption in transit and at rest.</p>
      <h2>Deleting your data</h2>
      <p>
        Delete your account at any time from <Link className="font-semibold underline" href="/profile">your profile</Link> → &ldquo;Delete my account
        and data&rdquo;. Everything is removed immediately: your profile, steps, workouts and tracker connections. See{" "}
        <Link className="font-semibold underline" href="/data-deletion">data deletion</Link> for details.
      </p>
      <h2>Children</h2>
      <p>{CHALLENGE.name} is not directed at children under 13, and we do not knowingly collect their data.</p>
      <h2>Changes</h2>
      <p>If this policy changes, we&apos;ll update the date at the top of this page.</p>
    </LegalPage>
  );
}

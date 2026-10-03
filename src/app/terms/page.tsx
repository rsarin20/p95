import { LegalPage } from "@/components/LegalPage";
import { CHALLENGE } from "@/lib/config";

export const metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="October 3, 2026">
      <p>By using {CHALLENGE.name} you agree to these simple terms.</p>
      <h2>Play fair</h2>
      <ul>
        <li>Log your own real activity. Don&apos;t invent steps or double-count workouts your tracker already counted.</li>
        <li>Pick a respectful display name and team name. We may rename or remove offensive names, and remove obviously fake scores.</li>
        <li>One account per person.</li>
      </ul>
      <h2>Your health</h2>
      <p>
        {CHALLENGE.name} is a fun challenge, not medical advice. Check with a doctor before starting a new exercise routine, and
        listen to your body.
      </p>
      <h2>The service</h2>
      <p>
        The app is provided free and &ldquo;as is&rdquo;. We work to keep it running and your data safe, but can&apos;t guarantee it
        will always be available or error-free. We may change or end the challenge.
      </p>
      <h2>Your content</h2>
      <p>You own what you enter. You let us display your display name, team and scores on the leaderboards so the challenge works.</p>
    </LegalPage>
  );
}

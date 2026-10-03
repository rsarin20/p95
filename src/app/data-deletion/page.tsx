import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Data deletion" };

export default function DataDeletion() {
  return (
    <LegalPage title="Delete your data" updated="October 3, 2026">
      <p>You can delete your account and all associated data yourself, instantly:</p>
      <ol className="ml-5 list-decimal space-y-1">
        <li>Sign in with the same Google, Apple or Facebook account you used before.</li>
        <li>Open <Link className="font-semibold underline" href="/profile">your profile</Link>.</li>
        <li>Tap &ldquo;Delete my account and data&rdquo;, type DELETE and confirm.</li>
      </ol>
      <p>
        This permanently removes your profile, step entries, workouts, team membership and any connected-tracker tokens. If you were a
        team captain, captaincy passes to another member; an empty team is removed.
      </p>
      <p>
        If you signed in with Facebook, you can also remove the app from Facebook → Settings → Apps and websites. That stops Facebook
        sharing data with us; delete your account here to remove what we already stored.
      </p>
    </LegalPage>
  );
}

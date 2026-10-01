import Link from "next/link";
import { disconnectProvider } from "@/app/actions";
import { requireUser } from "@/lib/session";
import { userConnections } from "@/lib/queries";
import { GARMIN, GOOGLE_HEALTH, appBaseUrl } from "@/lib/connectors";
import { AppleHealthSetup } from "@/components/AppleHealthSetup";
import { SyncButton } from "@/components/SyncButton";

export const metadata = { title: "Connect" };

const MESSAGES: Record<string, string> = {
  google_unavailable: "Google sync isn't switched on yet for this app. Use manual entry for now.",
  google_denied: "Google connection was cancelled.",
  google_failed: "We couldn't finish connecting Google. Please try again.",
  garmin_unavailable: "Garmin sync isn't switched on yet for this app. Use manual entry for now.",
  garmin_denied: "Garmin connection was cancelled.",
  garmin_failed: "We couldn't finish connecting Garmin. Please try again.",
};

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const conns = await userConnections(user.id);
  const conn = (p: string) => conns.find((c) => c.provider === p);
  const google = conn("google");
  const garmin = conn("garmin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Connect your steps</h1>
        <p className="muted mt-1 max-w-2xl">
          Link a tracker so your steps flow in automatically — or just type them in. If more than one source reports a day, we
          count the highest, so connecting several is safe.
        </p>
      </div>
      {sp.error && <div className="card !py-3 font-semibold text-maple-500">{MESSAGES[sp.error] ?? "Something went wrong."}</div>}
      {sp.connected && <div className="card animate-pop !py-3 font-semibold text-forest-500">✓ Connected! Your recent steps are syncing.</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Apple Health */}
        <Card icon="🍎" title="Apple Health" status={user.has_token ? "Shortcut token active" : null} badge="iPhone">
          <p className="muted text-sm">
            Apple doesn&apos;t let websites read Health data directly, so we use a 1-minute iPhone Shortcut that sends your daily
            step total to {""}
            <b>your</b> Walktober account. Works with anything that writes to Apple Health — Apple Watch, Oura, Garmin, Fitbit, Whoop…
          </p>
          <AppleHealthSetup endpoint={`${appBaseUrl()}/api/ingest`} hasToken={user.has_token} />
        </Card>

        {/* Google */}
        <Card icon="🟢" title="Google (Fit / Fitbit / Pixel)" status={google ? syncStatus(google) : null} badge="Android">
          <p className="muted text-sm">
            Syncs daily steps from your Google account via the new Google Health API — covers Fitbit, Pixel Watch and data synced
            from Google Fit.
          </p>
          {google ? (
            <div className="flex flex-wrap gap-2">
              <SyncButton />
              <form action={disconnectProvider.bind(null, "google")}>
                <button className="btn-ghost !py-2">Disconnect</button>
              </form>
            </div>
          ) : GOOGLE_HEALTH.enabled() ? (
            <a href="/api/connect/google" className="btn-primary">Connect Google</a>
          ) : (
            <ComingSoon text="Google sync is awaiting Google's API approval. Android tip: until then, type your daily total from the Fit app — it takes 5 seconds." />
          )}
        </Card>

        {/* Garmin */}
        <Card icon="⌚" title="Garmin Connect" status={garmin ? syncStatus(garmin) : null} badge="Watch">
          <p className="muted text-sm">
            Garmin pushes your daily step summary to us automatically after each watch sync. Nothing to press.
          </p>
          {garmin ? (
            <form action={disconnectProvider.bind(null, "garmin")}>
              <button className="btn-ghost !py-2">Disconnect</button>
            </form>
          ) : GARMIN.enabled() ? (
            <a href="/api/connect/garmin" className="btn-primary">Connect Garmin</a>
          ) : (
            <ComingSoon text="Garmin sync is awaiting Garmin's developer approval. iPhone + Garmin? Turn on Garmin Connect → Apple Health and use the Apple Health shortcut today." />
          )}
        </Card>

        {/* Manual */}
        <Card icon="✍️" title="Manual entry" status="Always on" badge="Any device">
          <p className="muted text-sm">
            Type in your daily steps and workouts from the Today screen. You can fill in past days of the challenge too.
          </p>
          <Link href="/dashboard" className="btn-primary">Log today</Link>
        </Card>
      </div>
    </div>
  );
}

function syncStatus(c: { last_sync_at: string | null; last_error: string | null }) {
  if (c.last_error) return `⚠️ ${c.last_error}`;
  if (c.last_sync_at) return `Connected · synced ${new Date(c.last_sync_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  return "Connected · waiting for first sync";
}

function Card({ icon, title, status, badge, children }: { icon: string; title: string; status: string | null; badge: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: "var(--bg-2)" }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{title}</h2>
            <span className="chip !py-0.5">{badge}</span>
          </div>
          {status && <div className={`mt-0.5 text-xs font-semibold ${status.startsWith("⚠️") ? "text-maple-500" : "text-forest-500 dark:text-forest-400"}`}>{status}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ComingSoon({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-3 text-sm hairline">
      <span className="font-semibold">Coming soon.</span> <span className="muted">{text}</span>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { createIngestToken, revokeIngestToken } from "@/app/actions";
import { CopyButton } from "./CopyButton";

export function AppleHealthSetup({ endpoint, hasToken }: { endpoint: string; hasToken: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      const res = await createIngestToken();
      if (res?.token) setToken(res.token);
    });

  return (
    <div className="space-y-4">
      {!token ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={generate} disabled={pending}>
            {pending ? "Generating…" : hasToken ? "Generate a new token" : "Set up Apple Health"}
          </button>
          {hasToken && (
            <button className="btn-ghost" disabled={pending} onClick={() => start(() => revokeIngestToken())}>
              Revoke token
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border p-4 hairline" style={{ background: "var(--bg)" }}>
          <div className="label">Your personal token — shown once</div>
          <div className="flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg-2)" }}>{token}</code>
            <CopyButton text={token} />
          </div>
          <p className="muted text-xs">Treat it like a password. Generating a new one disables the old one.</p>
        </div>
      )}

      <details className="rounded-2xl border p-4 text-sm hairline" open={Boolean(token)}>
        <summary className="cursor-pointer font-semibold">📱 Build the Shortcut (1 minute)</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>Open the <b>Shortcuts</b> app → <b>+</b> to create a new shortcut. Name it “Walktober”.</li>
          <li>
            Add <b>Find Health Samples</b>: Type <b>Steps</b>, filter <b>Start Date is Today</b>, Group by <b>Day</b>.
          </li>
          <li>
            Add <b>Calculate Statistics</b> → <b>Sum</b> of the Health Samples.
          </li>
          <li>
            Add <b>Get Contents of URL</b>:
            <div className="mt-2 space-y-2">
              <Row label="URL" value={endpoint} />
              <Row label="Method" value="POST" />
              <Row label="Header" value={`Authorization: Bearer ${token ?? "<your token>"}`} copyValue={token ? `Bearer ${token}` : undefined} />
              <Row label="Body (JSON)" value="steps → Statistics (Sum)" />
            </div>
          </li>
          <li>
            Add <b>Show Notification</b> with “Contents of URL” to see the confirmation. Run it once and tap <b>Allow</b> for Health access.
          </li>
          <li>
            Automate it: <b>Automation</b> tab → <b>+</b> → <b>Time of Day</b> → 9:00 PM daily (and another at 11:55 PM) → run
            “Walktober” → set to <b>Run Immediately</b>.
          </li>
        </ol>
        <p className="muted mt-3 text-xs">
          Missed a day? Add a <code>date</code> field (format <code>yyyy-MM-dd</code>) to the JSON body to backfill it.
        </p>
      </details>
    </div>
  );
}

function Row({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="muted w-20 shrink-0 text-xs font-semibold uppercase">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-xs" style={{ background: "var(--bg-2)" }}>{value}</code>
      {(copyValue ?? (label === "URL" ? value : undefined)) && <CopyButton text={copyValue ?? value} className="btn-ghost !px-3 !py-1 text-xs" />}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const router = useRouter();
  return (
    <button
      className="btn-ghost !py-2"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch("/api/sync", { method: "POST" }).catch(() => null);
        setState(res?.ok ? "done" : "error");
        router.refresh();
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "busy" ? "Syncing…" : state === "done" ? "Synced ✓" : state === "error" ? "Sync failed" : "↻ Sync"}
    </button>
  );
}

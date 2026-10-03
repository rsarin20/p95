"use client";

import { signOut } from "next-auth/react";
import { useActionState, useEffect } from "react";
import { deleteAccount, type ActionState } from "@/app/actions";

export function DangerZone() {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteAccount, null);
  useEffect(() => {
    if (state?.ok) signOut({ callbackUrl: "/" });
  }, [state]);
  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-bold">Sign out</div>
          <div className="muted text-sm">Your progress is saved.</div>
        </div>
        <button className="btn-ghost" onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </button>
      </div>
      <details className="border-t pt-4 hairline">
        <summary className="cursor-pointer text-sm font-semibold text-maple-500">Delete my account and data</summary>
        <form action={action} className="mt-3 space-y-3">
          <p className="muted text-sm">This permanently deletes your profile, steps, workouts and connections. Type DELETE to confirm.</p>
          <input name="confirm" className="input" placeholder="DELETE" autoComplete="off" />
          {state?.error && <p className="text-sm font-semibold text-maple-500">{state.error}</p>}
          <button className="btn-danger" disabled={pending}>
            {pending ? "Deleting…" : "Delete everything"}
          </button>
        </form>
      </details>
    </div>
  );
}

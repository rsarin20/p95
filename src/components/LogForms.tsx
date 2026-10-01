"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { logExercise, logSteps, removeExercise, type ActionState } from "@/app/actions";
import { INTENSITIES, INTENSITY_INFO, SCORING, type Intensity } from "@/lib/config";

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <p className="mt-2 text-sm font-semibold text-maple-500">{state.error}</p>;
  if (state.message) return <p className="mt-2 animate-pop text-sm font-semibold text-forest-500 dark:text-forest-400">✓ {state.message}</p>;
  return null;
}

export function StepForm({ day, current }: { day: string; current: number | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(logSteps, null);
  const [value, setValue] = useState(current ? String(current) : "");
  useEffect(() => setValue(current ? String(current) : ""), [current, day]);
  return (
    <form action={action}>
      <input type="hidden" name="day" value={day} />
      <div className="flex gap-2">
        <input
          name="steps"
          inputMode="numeric"
          pattern="[0-9,]*"
          className="input num text-lg font-bold"
          placeholder="e.g. 8,500"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          aria-label="Steps"
        />
        <button className="btn-primary shrink-0 !px-6" disabled={pending || value === ""}>
          {pending ? "…" : current ? "Update" : "Save"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ExerciseForm({ day }: { day: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(logExercise, null);
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [minutes, setMinutes] = useState("30");
  const pts = (Number(minutes) || 0) * SCORING.exercisePointsPerMinute[intensity];
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="intensity" value={intensity} />
      <div className="grid grid-cols-3 gap-2">
        {INTENSITIES.map((i) => (
          <button
            type="button"
            key={i}
            onClick={() => setIntensity(i)}
            aria-pressed={intensity === i}
            className={`rounded-2xl border p-3 text-center transition hairline ${intensity === i ? "border-pumpkin-500 ring-2 ring-pumpkin-400" : ""}`}
            style={{ background: intensity === i ? "color-mix(in srgb, var(--accent) 10%, var(--card))" : "var(--bg)" }}
          >
            <div className="text-2xl">{INTENSITY_INFO[i].emoji}</div>
            <div className="text-sm font-bold">{INTENSITY_INFO[i].label}</div>
            <div className="muted text-[11px]">{SCORING.exercisePointsPerMinute[i]} pts/min</div>
          </button>
        ))}
      </div>
      <p className="muted text-xs">
        <b>{INTENSITY_INFO[intensity].label}:</b> {INTENSITY_INFO[intensity].met}. {INTENSITY_INFO[intensity].examples}.
      </p>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <input name="label" className="input" placeholder="What did you do? (optional)" maxLength={40} />
        <div className="relative">
          <input
            name="minutes"
            inputMode="numeric"
            className="input num pr-12 font-bold"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            aria-label="Minutes"
          />
          <span className="muted pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm">min</span>
        </div>
      </div>
      <button className="btn-primary w-full" disabled={pending || !Number(minutes)}>
        {pending ? "Adding…" : `Add workout · +${pts.toLocaleString()} pts`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function RemoveActivityButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="muted grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-maple-500/10 hover:text-maple-500"
      aria-label="Remove workout"
      disabled={pending}
      onClick={() => start(() => removeExercise(id))}
    >
      {pending ? "…" : "×"}
    </button>
  );
}

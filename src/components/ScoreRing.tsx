export function ScoreRing({ value, goal, size = 200 }: { value: number; goal: number; size?: number }) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, goal ? value / goal : 0);
  const over = value >= goal;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7d27a" />
            <stop offset="55%" stopColor="#f2711c" />
            <stop offset="100%" stopColor="#c8372a" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl">{over ? "🏅" : "👟"}</div>
          <div className="num font-display text-4xl font-extrabold leading-tight">{value.toLocaleString()}</div>
          <div className="muted text-xs font-semibold uppercase tracking-wider">
            {over ? "goal smashed" : `of ${goal.toLocaleString()} steps`}
          </div>
        </div>
      </div>
    </div>
  );
}

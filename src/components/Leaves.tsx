// Decorative falling leaves. Pure CSS, hidden for reduced-motion users.
const LEAVES = [
  { left: "6%", delay: "0s", dur: "19s", size: 18, glyph: "🍂" },
  { left: "22%", delay: "7s", dur: "23s", size: 14, glyph: "🍁" },
  { left: "41%", delay: "3s", dur: "26s", size: 12, glyph: "🍂" },
  { left: "63%", delay: "11s", dur: "21s", size: 16, glyph: "🍁" },
  { left: "79%", delay: "5s", dur: "28s", size: 13, glyph: "🍂" },
  { left: "92%", delay: "14s", dur: "24s", size: 17, glyph: "🍁" },
];

export function Leaves() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {LEAVES.map((l, i) => (
        <span
          key={i}
          className="leaf absolute top-0 animate-fall opacity-0"
          style={{ left: l.left, animationDelay: l.delay, animationDuration: l.dur, fontSize: l.size }}
        >
          {l.glyph}
        </span>
      ))}
    </div>
  );
}

import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1d1a17", soft: "#4a423b", mute: "#7a6f66" },
        cream: { DEFAULT: "#fbf6ee", deep: "#f3e9da" },
        pumpkin: { 50: "#fff4ea", 100: "#ffe3c9", 300: "#ffb070", 400: "#ff9142", 500: "#f2711c", 600: "#d35a0c", 700: "#a8440b" },
        maple: { 400: "#e2533b", 500: "#c8372a", 600: "#a12a20" },
        gold: { 300: "#f7d27a", 400: "#f2bb3c", 500: "#d99a12" },
        forest: { 400: "#4f8a68", 500: "#2f6b4c", 600: "#22533a", 900: "#12261c" },
        night: { DEFAULT: "#15120f", card: "#211c18", line: "#352d27" },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(29,26,23,.04), 0 8px 24px -12px rgba(29,26,23,.18)",
      },
      keyframes: {
        fall: {
          "0%": { transform: "translate3d(0,-10vh,0) rotate(0deg)", opacity: "0" },
          "10%": { opacity: ".9" },
          "100%": { transform: "translate3d(60px,110vh,0) rotate(540deg)", opacity: "0" },
        },
        pop: { "0%": { transform: "scale(.96)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
      },
      animation: { fall: "fall linear infinite", pop: "pop .25s ease-out" },
    },
  },
  plugins: [],
} satisfies Config;

"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy", className = "btn-ghost !py-2" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-primary"
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ url, title, text });
            return;
          } catch {
            /* cancelled */
          }
        }
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Link copied ✓" : "📣 Invite teammates"}
    </button>
  );
}

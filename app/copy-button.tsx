"use client";

import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="action outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // The prompt stays on screen and selectable, so a browser that
          // refuses the write needs no separate recovery path.
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

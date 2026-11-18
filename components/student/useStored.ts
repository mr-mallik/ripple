"use client";

import { useCallback, useState } from "react";

// Small per-device preferences (trusted contacts, visibility, blocked people).
// They stay in this browser only and are never sent to Ripple's servers.
const PREFIX = "ripple-student:";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const set = useCallback(
    (next: T | ((cur: T) => T)) => {
      setValue((cur) => {
        const v = typeof next === "function" ? (next as (c: T) => T)(cur) : next;
        try {
          window.localStorage.setItem(PREFIX + key, JSON.stringify(v));
        } catch {
          // Private mode or storage blocked: keep it for this visit only.
        }
        return v;
      });
    },
    [key],
  );
  return [value, set] as const;
}

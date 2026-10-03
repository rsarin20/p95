"use client";

import { useEffect } from "react";
import { updateTimezone } from "@/app/actions";

/** Keeps the user's time zone current so "today" means *their* today. */
export function TimezoneSync({ current }: { current: string }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) updateTimezone(tz).catch(() => {});
  }, [current]);
  return null;
}

"use client";

import { useEffect } from "react";

/** Remembers the last calendar view so /bookings opens where you left off. */
export function RememberView({ view }: { view: string }) {
  useEffect(() => {
    document.cookie = `bookingsView=${view}; path=/; max-age=31536000; samesite=lax`;
  }, [view]);
  return null;
}

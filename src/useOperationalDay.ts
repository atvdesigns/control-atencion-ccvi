import { useEffect, useState } from "react";
import { todayId } from "./store";

export const useOperationalDay = (timezone: string, enabled: boolean) => {
  const [, setObservedDay] = useState(() => todayId(timezone));

  useEffect(() => {
    if (!enabled) return;

    const checkDay = () => setObservedDay(todayId(timezone));
    checkDay();
    // Only check the local clock; Firebase resubscribes only when the day changes.
    const timer = window.setInterval(checkDay, 30_000);
    window.addEventListener("focus", checkDay);
    document.addEventListener("visibilitychange", checkDay);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkDay);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, [timezone, enabled]);

  // Also handle a render that occurs at midnight before the next timer tick.
  return todayId(timezone);
};

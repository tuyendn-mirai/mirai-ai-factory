import type { ThreadSummary } from "./types";

export interface ThreadGroup {
  name: string;
  items: ThreadSummary[];
}

/** Groups threads into "Today" / "Yesterday" / "Previous 7 days" / "Older" buckets, matching the sidebar mockup. */
export function groupThreadsByDate(threads: ThreadSummary[]): ThreadGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const buckets: Record<string, ThreadSummary[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  const sorted = [...threads].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  for (const thread of sorted) {
    const updated = new Date(thread.updatedAt);
    if (updated >= startOfToday) {
      buckets.Today.push(thread);
    } else if (updated >= startOfYesterday) {
      buckets.Yesterday.push(thread);
    } else if (updated >= sevenDaysAgo) {
      buckets["Previous 7 days"].push(thread);
    } else {
      buckets.Older.push(thread);
    }
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([name, items]) => ({ name, items }));
}

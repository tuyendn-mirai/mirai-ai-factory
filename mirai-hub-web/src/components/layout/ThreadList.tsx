"use client";

import { useThreadsQuery } from "@/hooks/useThreads";
import { groupThreadsByDate } from "@/lib/group-threads";
import { ThreadGroup } from "./ThreadGroup";

interface ThreadListProps {
  activeThreadId?: string;
}

export function ThreadList({ activeThreadId }: ThreadListProps) {
  const { data: threads = [] } = useThreadsQuery();
  const groups = groupThreadsByDate(threads);

  return (
    // min-h-0 overrides the flex item's default min-height:auto -- without
    // it, this flex-1 column refuses to shrink below its own (long) content
    // height, so overflow-y-auto never actually engages and the whole page
    // scrolls instead of just this list.
    <div className="mt-[18px] flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
      {groups.map((group) => (
        <ThreadGroup key={group.name} group={group} activeThreadId={activeThreadId} />
      ))}
    </div>
  );
}

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
    <div className="mt-[18px] flex flex-1 flex-col gap-3.5 overflow-y-auto">
      {groups.map((group) => (
        <ThreadGroup key={group.name} group={group} activeThreadId={activeThreadId} />
      ))}
    </div>
  );
}

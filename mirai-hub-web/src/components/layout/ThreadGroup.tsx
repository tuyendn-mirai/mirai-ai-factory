"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ThreadGroup as ThreadGroupData } from "@/lib/group-threads";

interface ThreadGroupProps {
  group: ThreadGroupData;
  activeThreadId?: string;
}

export function ThreadGroup({ group, activeThreadId }: ThreadGroupProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground/80">
        {group.name}
      </span>
      {group.items.map((thread) => {
        const active = thread.id === activeThreadId;
        return (
          <button
            key={thread.id}
            type="button"
            onClick={() => router.push(`/chat/${thread.id}`)}
            className={cn(
              "flex h-8 items-center rounded-md px-2.5 text-left text-[13px] hover:bg-sidebar-accent",
              active ? "bg-sidebar-accent font-semibold text-primary" : "font-medium text-foreground/80",
            )}
          >
            <span className="truncate">{thread.name}</span>
          </button>
        );
      })}
    </div>
  );
}

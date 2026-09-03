"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SettingsPanel } from "./SettingsPanel";
import { ThreadList } from "./ThreadList";
import { AccountRow } from "./AccountRow";
import { usePendingThreadSettings } from "@/components/providers/PendingThreadSettingsProvider";

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams<{ threadId?: string }>();
  const router = useRouter();
  const pending = usePendingThreadSettings();

  const activeThreadId = typeof params?.threadId === "string" ? params.threadId : undefined;
  const isNewChatActive = pathname === "/chat";

  return (
    <aside className="flex h-screen w-[280px] flex-none flex-col border-r border-sidebar-border bg-sidebar p-4">
      <div className="flex items-center px-1 pb-[18px] pt-1">
        <Link href="/chat">
          <Image src="/logo_light.png" alt="Mirai Hub" width={148} height={36} priority className="h-auto w-[148px]" />
        </Link>
      </div>

      <button
        type="button"
        onClick={() => {
          pending.reset();
          router.push("/chat");
        }}
        className={cn(
          "flex h-[38px] items-center justify-center gap-2 rounded-lg border text-[13.5px] font-semibold",
          isNewChatActive
            ? "border-primary bg-sidebar-accent text-primary"
            : "border-border bg-background text-foreground hover:bg-accent",
        )}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
      </button>

      <div className="mt-4">
        <SettingsPanel threadId={activeThreadId} />
      </div>

      <ThreadList activeThreadId={activeThreadId} />

      <AccountRow />
    </aside>
  );
}

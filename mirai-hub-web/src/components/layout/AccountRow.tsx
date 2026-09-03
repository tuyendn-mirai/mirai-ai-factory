"use client";

import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMeQuery } from "@/hooks/useThreads";
import { logout } from "@/lib/api-client";

export function AccountRow() {
  const router = useRouter();
  const { data: user } = useMeQuery();
  const username = user?.username ?? "admin";

  async function onLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-none items-center gap-2.5 border-t border-sidebar-border pt-3">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {username.charAt(0).toUpperCase()}
      </div>
      <span className="flex-1 truncate text-[13px] font-semibold text-foreground">{username}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Tài khoản" className="text-muted-foreground hover:text-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-40 p-1">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
          >
            Đăng xuất
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

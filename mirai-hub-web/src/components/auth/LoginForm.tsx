"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "success" | "error";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    setError(null);
    try {
      await login(username, password);
      setStatus("success");
      setTimeout(() => {
        router.push("/chat");
        router.refresh();
      }, 700);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-2.5 py-[18px] pb-1.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-foreground">Đăng nhập thành công</span>
        <span className="text-[12.5px] text-muted-foreground">Đang chuyển đến Mirai Hub…</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-[12.5px] font-semibold text-foreground">
          Username
        </label>
        <div className="flex h-10 items-center rounded-lg border border-border px-3">
          <input
            id="username"
            className="mh-input w-full text-sm text-foreground"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[12.5px] font-semibold text-foreground">
          Password
        </label>
        <div
          className={cn(
            "flex h-10 items-center gap-2 rounded-lg border py-0 pl-3 pr-2 transition-colors",
            pwFocused ? "border-primary shadow-[0_0_0_3px_rgba(5,35,98,0.12)]" : "border-border",
          )}
        >
          <input
            id="password"
            className={cn("mh-input w-full text-sm text-foreground", !showPassword && "tracking-[2px]")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPwFocused(true)}
            onBlur={() => setPwFocused(false)}
            autoComplete="current-password"
          />
          <button
            type="button"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onClick={() => setShowPassword((v) => !v)}
            className="flex h-6 w-6 flex-none items-center justify-center text-muted-foreground"
          >
            {showPassword ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0112 19c-6.5 0-10-7-10-7a18.5 18.5 0 014.22-5.19M9.9 4.24A10.94 10.94 0 0112 4c6.5 0 10 7 10 7a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24" />
                <path d="M2 2l20 20" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && <p className="text-[12.5px] text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-1.5 flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-70"
      >
        {status === "loading" && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-[mh-spin_0.8s_linear_infinite]">
            <path d="M12 2a10 10 0 100 20" />
          </svg>
        )}
        <span>{status === "loading" ? "Đang đăng nhập…" : "Đăng nhập"}</span>
      </button>
    </form>
  );
}

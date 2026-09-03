interface McpSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function McpSearchBar({ value, onChange }: McpSearchBarProps) {
  return (
    <div className="flex h-[34px] w-60 items-center gap-2 rounded-lg border border-border px-2.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        className="mh-input flex-1 text-[13px] text-foreground"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tìm project…"
      />
    </div>
  );
}

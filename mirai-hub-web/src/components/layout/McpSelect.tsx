"use client";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { McpProject } from "@/lib/types";

const NONE_VALUE = "__none__";

interface McpSelectProps {
  value: string | null;
  connected: boolean;
  projectName: string | null;
  options: McpProject[];
  onChange: (value: string | null) => void;
}

export function McpSelect({ value, connected, projectName, options, onChange }: McpSelectProps) {
  const selected = value ?? NONE_VALUE;

  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        MCP server
      </span>
      <Select value={selected} onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}>
        <SelectTrigger className="h-[34px] rounded-md border-border px-[10px] text-[13px] font-medium shadow-none focus:ring-1 focus:ring-ring">
          <span className="flex items-center gap-[7px] overflow-hidden">
            {connected && <span className="h-1.5 w-1.5 flex-none rounded-full bg-green-600" />}
            <span
              className={cn(
                "truncate",
                value === null ? "italic text-muted-foreground" : "text-foreground",
              )}
            >
              {value === null ? "— no MCP server —" : projectName ?? value}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE} className="text-[12.5px] italic text-muted-foreground">
            — no MCP server —
          </SelectItem>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-[12.5px]">
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

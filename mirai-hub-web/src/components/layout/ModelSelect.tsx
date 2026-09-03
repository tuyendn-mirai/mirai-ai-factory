"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ModelSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function ModelSelect({ value, options, onChange }: ModelSelectProps) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        Model
      </span>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-[34px] rounded-md border-border px-[10px] text-[13px] font-medium text-foreground shadow-none focus:ring-1 focus:ring-ring">
          <SelectValue placeholder="Chọn model" />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m} value={m} className="text-[12.5px]">
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

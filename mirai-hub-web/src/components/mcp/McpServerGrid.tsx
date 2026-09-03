import { McpServerCard } from "./McpServerCard";
import type { McpProject } from "@/lib/types";

interface McpServerGridProps {
  projects: McpProject[];
  query: string;
  connectedProjectId: string | null;
  connectedToolCount: number | null;
  pendingProjectId: string | null;
  onToggle: (projectId: string) => void;
}

export function McpServerGrid({
  projects,
  query,
  connectedProjectId,
  connectedToolCount,
  pendingProjectId,
  onToggle,
}: McpServerGridProps) {
  const q = query.trim().toLowerCase();
  const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-[60px] text-muted-foreground">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <span className="text-[13px]">Không tìm thấy project nào khớp &quot;{query}&quot;</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {filtered.map((project) => {
        const connected = project.id === connectedProjectId;
        return (
          <McpServerCard
            key={project.id}
            project={project}
            connected={connected}
            toolCount={connected ? connectedToolCount : null}
            pending={pendingProjectId === project.id}
            onToggle={() => onToggle(project.id)}
          />
        );
      })}
    </div>
  );
}

import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { PendingThreadSettingsProvider } from "@/components/providers/PendingThreadSettingsProvider";
import { queryKeys } from "@/hooks/useThreads";
import { getMcpProjectsServer, getModelsServer, getThreadsServer } from "@/lib/api-server";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery({ queryKey: queryKeys.threads, queryFn: getThreadsServer }),
    queryClient.prefetchQuery({ queryKey: queryKeys.models, queryFn: getModelsServer }),
    queryClient.prefetchQuery({ queryKey: queryKeys.mcpProjects, queryFn: getMcpProjectsServer }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PendingThreadSettingsProvider>
        <div className="flex h-screen bg-background">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </PendingThreadSettingsProvider>
    </HydrationBoundary>
  );
}

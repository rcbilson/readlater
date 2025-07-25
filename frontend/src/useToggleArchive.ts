import { toaster } from "@/components/ui/toaster"
import { useQueryClient } from '@tanstack/react-query';
import { syncManager } from "./syncManager";

const useToggleArchive = () => {
  const queryClient = useQueryClient();
  
  return async (url: string, archived: boolean) => {
    try {
      // Use sync manager for local-first operation
      await syncManager.setArchive(url, archived);
      
      // Invalidate all article list queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['articleList'] });
      
      toaster.create({
        title: archived ? "Article archived" : "Article unarchived",
        type: "success",
      });
    } catch (e) {
      toaster.create({
        title: "Failed to update archive status",
        description: e instanceof Error ? e.message : undefined,
        type: "error",
      });
    }
  };
};

export { useToggleArchive };
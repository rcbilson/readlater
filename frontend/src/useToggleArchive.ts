import { toaster } from "@/components/ui/toaster-config"
import { useQueryClient } from '@tanstack/react-query';
import { getSyncService } from "./sync";

const useToggleArchive = () => {
  const queryClient = useQueryClient();

  return async (url: string, archived: boolean) => {
    try {
      // Use sync service for local-first operation
      await getSyncService().setArchive(url, archived);
      
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
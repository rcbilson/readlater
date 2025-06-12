import { useContext } from "react";
import { toaster } from "@/components/ui/toaster"
import axios from "axios";
import { AuthContext } from "@/components/ui/auth-context";
import { useQueryClient } from '@tanstack/react-query';

const useToggleArchive = () => {
  const { token } = useContext(AuthContext);
  const queryClient = useQueryClient();
  
  return async (url: string, archived: boolean) => {
    try {
      await axios.put("/api/setArchive", null, {
        params: {
          url: url,
          setArchive: archived.toString()
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
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
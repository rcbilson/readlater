import { useContext } from "react";
import { toaster } from "@/components/ui/toaster-config"
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { AuthContext } from "@/components/ui/auth-context";
import { useQueryClient } from '@tanstack/react-query';
import { ArticleRequest } from './Article';
import { getSyncService } from './sync';

const useDoAdd = () => {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);
  const queryClient = useQueryClient();
  return async (url: string, titleHint?: string) => {
    try {
        const request: ArticleRequest = { url: url, titleHint: titleHint };
        await axios.post("/api/summarize", request, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        toaster.create({
            title: "Article added successfully!",
            type: "success",
        });
        queryClient.invalidateQueries({ queryKey: ['articleList'] })

        // Force sync to ensure new article appears in RecentPage
        // Uses forceSyncNow to bypass rate limiting after adding
        await getSyncService().forceSyncNow();

        navigate("/recent", { replace: true });
    } catch (e) {
        toaster.create({
            title: "Invalid URL",
            description: e instanceof Error ? e.message : undefined,
            type: "error",
        });
        return;
    }
  }
}

export { useDoAdd };

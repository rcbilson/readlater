import { toaster } from "@/components/ui/toaster-config"
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getSyncService } from './sync';

const useDoAdd = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async (url: string, titleHint?: string) => {
    try {
        // downloadArticle calls /api/summarize and stores the result
        // directly in IndexedDB, so the article is available locally
        // before we navigate. It also triggers a background sync.
        await getSyncService().downloadArticle(url, titleHint);
        toaster.create({
            title: "Article added successfully!",
            type: "success",
        });
        queryClient.invalidateQueries({ queryKey: ['articleList'] })

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

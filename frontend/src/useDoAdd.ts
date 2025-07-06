import { useContext } from "react";
import { toaster } from "@/components/ui/toaster"
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { AuthContext } from "@/components/ui/auth-context";
import { useQueryClient } from '@tanstack/react-query';
import { ArticleRequest } from './Article';

const useDoAdd = () => {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);
  const queryClient = useQueryClient();
  return async (url: string, titleHint?: string) => {
    try {
        const fixedUrl = new URL(url);
        // react-router double decodes slash characters in urls
        // see https://github.com/remix-run/react-router/pull/13813
        // try to work around this by throwing away search params
        fixedUrl.search = "";
        const request: ArticleRequest = { url: fixedUrl.toString(), titleHint: titleHint };
        await axios.post("/api/summarize", request, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
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

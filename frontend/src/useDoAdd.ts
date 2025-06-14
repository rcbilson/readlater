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
        new URL(url);
        const request: ArticleRequest = { url: url, titleHint: titleHint };
        await axios.post("/api/summarize", request, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        toaster.create({
            title: "Recipe added successfully!",
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

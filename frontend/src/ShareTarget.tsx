import { useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AuthContext } from "@/components/ui/auth-context";
import { useQueryClient } from '@tanstack/react-query';
import { ArticleRequest } from './Article';

// This component acts as a PWA share target. It reads the shared URL from the POSTed form data
// and redirects to /show... for display.
export default function ShareTarget() {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only run on mount
    if (window.location?.search) {
      // GET with ?url=...
      const params = new URLSearchParams(window.location.search);
      const url = params.get("text");
      const title = params.get("title");

      if (!url) return;

      const request: ArticleRequest = { url: url, titleHint: title || undefined };
      axios.post("/api/summarize", request, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['articleList'] })
        navigate("/recent", { replace: true })
      });
      return;
    }
  }, [navigate, token, queryClient]);

  return (
    <div style={{ padding: "2em", textAlign: "center" }}>
      <h2>Processing shared link…</h2>
      <p>If this message doesn't go away, show it to Richard.</p>
      <p>The url received was {window.location.href}</p>
    </div>
  );
}

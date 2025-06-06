import { useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AuthContext } from "@/components/ui/auth-context";

// ArticleRequest is a type consisting of the url of a article to fetch.
type ArticleRequest = {
  url: string;
  titleHint?: string; // optional title hint for the article
}

// This component acts as a PWA share target. It reads the shared URL from the POSTed form data
// and redirects to /show... for display.
export default function ShareTarget() {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

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
      }).then(() => navigate("/recent", { replace: true }));
      return;
    }
  }, [navigate, token]);

  return (
    <div style={{ padding: "2em", textAlign: "center" }}>
      <h2>Processing shared link…</h2>
      <p>If this message doesn't go away, show it to Richard.</p>
      <p>The url received was {window.location.href}</p>
    </div>
  );
}

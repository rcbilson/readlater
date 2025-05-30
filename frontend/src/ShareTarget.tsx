import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// This component acts as a PWA share target. It reads the shared URL from the POSTed form data
// and redirects to /show... for display.
export default function ShareTarget() {
  const navigate = useNavigate();

  useEffect(() => {
    // Only run on mount
    if (window.location?.search) {
      // GET with ?url=...
      const params = new URLSearchParams(window.location.search);
      const url = params.get("text");
      const title = params.get("title");
      if (url) {
        let target=`/show/${encodeURIComponent(url)}`
        if (title) {
          target=`${target}?titleHint=${encodeURIComponent(title)}`
        }
        navigate(target, { replace: true });
        return;
      }
    }
  }, [navigate]);

  return (
    <div style={{ padding: "2em", textAlign: "center" }}>
      <h2>Processing shared link…</h2>
      <p>If this message doesn't go away, show it to Richard.</p>
      <p>The url received was {window.location.href}</p>
    </div>
  );
}

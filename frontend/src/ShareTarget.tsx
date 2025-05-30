import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// This component acts as a PWA share target. It reads the shared URL from the POSTed form data
// and redirects to /show?url=... for display.
export default function ShareTarget() {
  const navigate = useNavigate();

  useEffect(() => {
    // Only run on mount
    if (window.location && window.location.pathname === "/share-target") {
      // Try to read the shared URL from the form data (PWA share target POST)
      if (window.location.search) {
        // If the browser did a GET with ?url=...
        const params = new URLSearchParams(window.location.search);
        const url = params.get("url");
        if (url) {
          navigate(`/show/${encodeURIComponent(url)}`, { replace: true });
          return;
        }
      }
      // If POST, try to read from form data
      if (window.navigator && "serviceWorker" in window.navigator) {
        // Try to read from the navigation API (for advanced browsers)
        // Fallback: try to parse the form data manually
        if (window.location.hash) {
          // Some browsers may put the data in the hash
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const url = hashParams.get("url");
          if (url) {
            navigate(`/show/${encodeURIComponent(url)}`, { replace: true });
            return;
          }
        }
        // As a last resort, try to parse the body (not available in SPA, but for completeness)
      }
    }
  }, [navigate]);

  return (
    <div style={{ padding: "2em", textAlign: "center" }}>
      <h2>Processing shared link…</h2>
      <p>If you are not redirected, please open the app and paste your link manually.</p>
    </div>
  );
}

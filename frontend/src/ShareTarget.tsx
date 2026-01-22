import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster"
import { useDoAdd } from "./useDoAdd"
import { isValidUrl } from "./sync"

// This component acts as a PWA share target. It reads the shared URL from the POSTed form data.
export default function ShareTarget() {
  const doAdd = useDoAdd();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only run on mount
    if (window.location?.search) {
      // GET with ?url=...
      const params = new URLSearchParams(window.location.search);
      const text = params.get("text");
      const title = params.get("title");

      if (!text) return;

      console.log("ShareTarget: Received text:", text);
      console.log("ShareTarget: Text length:", text.length);

      // Validate the text is a valid URL before processing
      if (!isValidUrl(text)) {
        console.error("ShareTarget: Invalid URL received:", text);
        setError(`The shared text is not a valid URL: "${text}"`);
        return;
      }

      // The backend should canonicalize URLs automatically, so we can send the full URL
      doAdd(text, title ?? undefined);
      return;
    }
  }, [doAdd]);

  if (error) {
    return (
      <>
        <Toaster />
        <div style={{ padding: "2em", textAlign: "center" }}>
          <h2>Invalid URL</h2>
          <p style={{ color: '#d32f2f' }}>{error}</p>
          <p>Please share a valid web link (starting with http:// or https://).</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster />
      <div style={{ padding: "2em", textAlign: "center" }}>
        <h2>Processing shared link...</h2>
        <p>If this message does not go away, show it to Richard.</p>
        <p>The url received was {window.location.href}</p>
      </div>
    </>
  );
}

import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster"
import { useDoAdd } from "./useDoAdd"

// This component acts as a PWA share target. It reads the shared URL from the POSTed form data.
export default function ShareTarget() {
  const doAdd = useDoAdd();

  useEffect(() => {
    // Only run on mount
    if (window.location?.search) {
      // GET with ?url=...
      const params = new URLSearchParams(window.location.search);
      const url = params.get("text");
      const title = params.get("title");

      if (!url) return;

      console.log("ShareTarget: Received URL:", url);
      console.log("ShareTarget: URL length:", url.length);
      
      // The backend should canonicalize URLs automatically, so we can send the full URL
      doAdd(url, title ?? undefined);
      return;
    }
  }, [doAdd]);

  return (
    <>
      <Toaster />
      <div style={{ padding: "2em", textAlign: "center" }}>
        <h2>Processing shared link…</h2>
        <p>If this message doesn't go away, show it to Richard.</p>
        <p>The url received was {window.location.href}</p>
      </div>
    </>
  );
}

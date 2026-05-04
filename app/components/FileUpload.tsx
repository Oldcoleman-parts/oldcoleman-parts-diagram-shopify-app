import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

interface Props {
  label: string;
  accept: string; // e.g. "image/*" or ".pdf,application/pdf"
  onComplete: (cdnUrl: string) => void;
  currentUrl?: string;
}

export function FileUpload({ label, accept, onComplete, currentUrl }: Props) {
  const shopify = useAppBridge();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentUrl ?? "");
  const [error, setError] = useState("");

  const isImage = accept.startsWith("image");

  async function handleChange(e: Event) {
    const detail = (e as CustomEvent).detail;
    const el = e.currentTarget as HTMLInputElement & { files?: FileList | File[] };
    const file: File | undefined = detail?.files?.[0] ?? el.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const token = await shopify.idToken();

      const body = new FormData();
      body.append("file", file);
      body.append("type", isImage ? "IMAGE" : "FILE");

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });

      let data: { cdnUrl?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server error (${res.status})`);
      }
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (!data.cdnUrl) throw new Error("No CDN URL returned");

      setPreview(data.cdnUrl);
      onComplete(data.cdnUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <s-drop-zone
        label={label}
        accept={accept}
        onChange={handleChange as EventListener}
        error={error || undefined}
      >
        {uploading ? (
          <s-stack direction="inline">
            <s-spinner />
            <s-text>Uploading…</s-text>
          </s-stack>
        ) : preview ? (
          <div style={{ padding: "8px" }}>
            {isImage ? (
              <img
                src={preview}
                alt="Preview"
                style={{ maxHeight: 80, maxWidth: 120, borderRadius: 4, display: "block" }}
              />
            ) : (
              <s-text>
                File uploaded —{" "}
                <s-link href={preview} target="_blank">
                  view
                </s-link>
              </s-text>
            )}
          </div>
        ) : (
          <s-text>
            Drop {isImage ? "an image" : "a PDF"} here or click to select
          </s-text>
        )}
      </s-drop-zone>

      {preview && !uploading && (
        <div style={{ marginTop: 4 }}>
          <s-button
            variant="tertiary"
            onClick={() => {
              setPreview("");
              onComplete("");
            }}
          >
            Remove
          </s-button>
        </div>
      )}
    </div>
  );
}

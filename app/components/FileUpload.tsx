import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

interface Props {
  label: string;
  accept: string;
  onComplete: (cdnUrl: string) => void;
  currentUrl?: string;
}

export function FileUpload({ label, accept, onComplete, currentUrl }: Props) {
  const shopify = useAppBridge();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentUrl ?? "");
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState(false);

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

  function remove() {
    setPreview("");
    onComplete("");
  }

  return (
    <div>
      {/* Image preview with overlay remove button */}
      {isImage && preview && !uploading && (
        <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            overflow: "hidden",
            background: "#f9fafb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "120px",
            padding: "12px",
            cursor: "zoom-in",
          }}
            onClick={() => setLightbox(true)}
          >
            <img
              src={preview}
              alt="Uploaded image"
              style={{
                maxHeight: "200px",
                maxWidth: "100%",
                objectFit: "contain",
                display: "block",
                borderRadius: "4px",
              }}
            />
          </div>
          <button
            type="button"
            onClick={remove}
            title="Remove image"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(0,0,0,0.55)",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: "pointer",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Drop zone: for PDF always, for images only when no preview */}
      {(!isImage || !preview || uploading) && (
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
          ) : preview && !isImage ? (
            <div style={{ padding: "8px" }}>
              <s-text>
                File uploaded —{" "}
                <s-link href={preview} target="_blank">view</s-link>
              </s-text>
            </div>
          ) : (
            <s-text>
              Drop {isImage ? "an image" : "a PDF"} here or click to select
            </s-text>
          )}
        </s-drop-zone>
      )}

      {/* PDF remove button */}
      {!isImage && preview && !uploading && (
        <div style={{ marginTop: 4 }}>
          <s-button variant="tertiary" onClick={remove}>Remove</s-button>
        </div>
      )}

      {/* Image preview modal */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "pointer",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "12px",
              padding: "12px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              position: "relative",
              maxWidth: "480px",
              width: "90vw",
            }}
          >
            <img
              src={preview}
              alt="Image preview"
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "400px",
                objectFit: "contain",
                borderRadius: "6px",
                display: "block",
              }}
            />
            <button
              type="button"
              onClick={() => setLightbox(false)}
              style={{
                position: "absolute",
                top: -10,
                right: -10,
                background: "#374151",
                border: "none",
                borderRadius: "50%",
                width: 28,
                height: 28,
                cursor: "pointer",
                color: "#fff",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

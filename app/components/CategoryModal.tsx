import { useState, useEffect, useRef, useCallback } from "react";
import { useFetcher } from "react-router";
import { FileUpload } from "./FileUpload";

export interface CategoryItem {
  id: number;
  name: string;
  imageUrl: string | null;
  parentId: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  rootCategories: CategoryItem[];
  editCategory?: CategoryItem | null;
}

// Outer wrapper: only mounts the inner modal when open.
// Unmounting resets all state and fetcher data automatically.
export function CategoryModal(props: Props) {
  if (!props.open) return null;
  return <CategoryModalInner {...props} />;
}

function CategoryModalInner({ onClose, rootCategories, editCategory }: Props) {
  const fetcher = useFetcher<{ errors?: Record<string, string> }>();
  const modalRef = useRef<HTMLElement & { showOverlay?: () => void; hideOverlay?: () => void } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissedRef = useRef(false);

  const [name, setName] = useState(editCategory?.name ?? "");
  const [imageUrl, setImageUrl] = useState(editCategory?.imageUrl ?? "");
  const [parentId, setParentId] = useState(
    editCategory?.parentId ? String(editCategory.parentId) : "",
  );

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    el.showOverlay?.();

    const onClose = () => dismiss();
    const onToggle = (e: Event) => {
      if ((e as Event & { newState?: string }).newState === "closed") dismiss();
    };
    el.addEventListener("hide", onClose);
    el.addEventListener("afterhide", onClose);
    el.addEventListener("close", onClose);
    el.addEventListener("toggle", onToggle);
    return () => {
      el.removeEventListener("hide", onClose);
      el.removeEventListener("afterhide", onClose);
      el.removeEventListener("close", onClose);
      el.removeEventListener("toggle", onToggle);
      el.hideOverlay?.();
    };
  }, [dismiss]);

  // Auto-close after a successful submit
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.errors) {
      dismiss();
    }
  }, [fetcher.state, fetcher.data, dismiss]);

  function handleSave() {
    if (!name.trim()) return;
    const data = new FormData();
    data.set("intent", editCategory ? "update" : "create");
    data.set("name", name.trim());
    if (parentId) data.set("parentId", parentId);
    if (imageUrl) data.set("imageUrl", imageUrl);
    if (editCategory) data.set("id", String(editCategory.id));
    fetcher.submit(data, { method: "post" });
  }

  const saving = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? {};

  return (
    <s-modal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={modalRef as any}
      heading={editCategory ? "Edit category" : "Add category"}
    >
      <s-stack direction="block" gap="base">
        <s-text-field
          label="Name"
          value={name}
          onInput={(e: Event) => setName((e.currentTarget as HTMLInputElement).value)}
          required
          error={errors.name}
        />

        <s-select
          label="Parent category"
          value={parentId}
          onChange={(e: Event) =>
            setParentId((e.currentTarget as HTMLSelectElement).value)
          }
        >
          <s-option value="">— No parent (root) —</s-option>
          {rootCategories
            .filter((c) => !editCategory || c.id !== editCategory.id)
            .map((c) => (
              <s-option key={c.id} value={String(c.id)}>
                {c.name}
              </s-option>
            ))}
        </s-select>

        <div>
          <s-text>Category image (optional)</s-text>
          <FileUpload
            label="Category image"
            accept="image/*"
            onComplete={setImageUrl}
            currentUrl={imageUrl || undefined}
          />
        </div>
      </s-stack>

      <s-button slot="primary-action" variant="primary" loading={saving} onClick={handleSave}>
        Save
      </s-button>
      <s-button slot="secondary-actions" onClick={dismiss} disabled={saving}>
        Cancel
      </s-button>
    </s-modal>
  );
}

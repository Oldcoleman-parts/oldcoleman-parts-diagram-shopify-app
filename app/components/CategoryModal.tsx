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
  onSaved?: (message: string) => void;
  allCategories: CategoryItem[];
  editCategory?: CategoryItem | null;
  defaultParentId?: number | null;
}

export function CategoryModal(props: Props) {
  if (!props.open) return null;
  return <CategoryModalInner {...props} />;
}

const dialogStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "8px",
  padding: 0,
  maxWidth: "600px",
  width: "90vw",
  boxShadow: "0 4px 20px rgba(0,0,0,.22)",
  background: "#fff",
  color: "inherit",
  fontFamily: "inherit",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid #e1e3e5",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  padding: "16px 20px",
  borderTop: "1px solid #e1e3e5",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "18px",
  lineHeight: 1,
  color: "#6d7175",
};

interface SelectOption {
  id: number;
  label: string;
}

function buildSelectOptions(cats: CategoryItem[], excludeId?: number): SelectOption[] {
  const map = new Map<number, CategoryItem & { children: CategoryItem[] }>();
  for (const c of cats) map.set(c.id, { ...c, children: [] });

  const roots: Array<CategoryItem & { children: CategoryItem[] }> = [];
  for (const [, node] of map) {
    if (!node.parentId || !map.has(node.parentId)) {
      roots.push(node);
    } else {
      map.get(node.parentId)!.children.push(node);
    }
  }

  // Collect self + all descendants to exclude from parent options (prevents circular refs)
  const excluded = new Set<number>();
  if (excludeId !== undefined) {
    const queue = [excludeId];
    while (queue.length) {
      const id = queue.shift()!;
      excluded.add(id);
      const node = map.get(id);
      if (node) for (const child of node.children) queue.push(child.id);
    }
  }

  const result: SelectOption[] = [];
  function traverse(nodes: Array<CategoryItem & { children: CategoryItem[] }>, depth: number) {
    const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));
    for (const node of sorted) {
      if (excluded.has(node.id)) continue;
      const prefix = depth === 0 ? "" : "—".repeat(depth) + " ";
      result.push({ id: node.id, label: prefix + node.name });
      traverse(node.children as Array<CategoryItem & { children: CategoryItem[] }>, depth + 1);
    }
  }
  traverse(roots, 0);
  return result;
}

function CategoryModalInner({ onClose, onSaved, allCategories, editCategory, defaultParentId }: Props) {
  const fetcher = useFetcher<{ errors?: Record<string, string> }>();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const isEditing = !!editCategory;
  const isCreatingRoot = !isEditing && !defaultParentId;

  const [name, setName] = useState(editCategory?.name ?? "");
  const [imageUrl, setImageUrl] = useState(editCategory?.imageUrl ?? "");
  const [parentId, setParentId] = useState(
    editCategory?.parentId
      ? String(editCategory.parentId)
      : defaultParentId
        ? String(defaultParentId)
        : "",
  );

  // Subcategories to create alongside the new root category
  const [subNames, setSubNames] = useState<string[]>([]);
  const [subInput, setSubInput] = useState("");

  function addSub() {
    const trimmed = subInput.trim();
    if (trimmed && !subNames.includes(trimmed)) {
      setSubNames((prev) => [...prev, trimmed]);
      setSubInput("");
    }
  }

  function removeSub(n: string) {
    setSubNames((prev) => prev.filter((x) => x !== n));
  }

  const dismiss = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    const onClose = () => onCloseRef.current();
    const onCancel = (e: Event) => { e.preventDefault(); dialog.close(); };
    const onClick = (e: MouseEvent) => {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left || e.clientX > r.right ||
        e.clientY < r.top  || e.clientY > r.bottom
      ) dialog.close();
    };

    dialog.addEventListener("close", onClose);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("click", onClick);
    return () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("click", onClick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.errors) {
      const msg = editCategory ? "Category updated successfully." : "Category created successfully.";
      onSavedRef.current?.(msg);
      dismiss();
    }
  }, [fetcher.state, fetcher.data, editCategory, dismiss]);

  function handleSave() {
    if (!name.trim()) return;
    const data = new FormData();
    data.set("intent", editCategory ? "update" : "create");
    data.set("name", name.trim());
    if (parentId) data.set("parentId", parentId);
    if (imageUrl) data.set("imageUrl", imageUrl);
    if (editCategory) data.set("id", String(editCategory.id));
    if (isCreatingRoot && subNames.length > 0) data.set("subcategoryNames", JSON.stringify(subNames));
    fetcher.submit(data, { method: "post" });
  }

  const saving = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? {};
  const options = buildSelectOptions(allCategories, editCategory?.id);

  const selectedParentLabel = options.find(o => String(o.id) === parentId)?.label;

  return (
    <dialog ref={dialogRef} className="app-modal" style={dialogStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: "16px", fontWeight: 600, color: "#202223" }}>
          {isEditing ? "Edit category" : isCreatingRoot ? "Create category" : "Create subcategory"}
        </span>
        <button onClick={dismiss} aria-label="Close" style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: "20px" }}>
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Name"
            value={name}
            onInput={(e: Event) => setName((e.currentTarget as HTMLInputElement).value)}
            required
            error={errors.name}
          />

          {/* Parent selector — only for subcategory creation or editing */}
          {!isCreatingRoot && (
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#202223", marginBottom: "6px" }}>
                Parent category
              </div>
              {parentId && selectedParentLabel && (
                <div style={{
                  fontSize: "12px", color: "#6d7175",
                  background: "#f6f6f7", border: "1px solid #e1e3e5",
                  borderRadius: "4px", padding: "4px 8px", marginBottom: "6px",
                  display: "inline-flex", alignItems: "center", gap: "6px",
                }}>
                  <span>📂</span>
                  <span>{selectedParentLabel}</span>
                </div>
              )}
              <s-select
                value={parentId}
                onChange={(e: Event) =>
                  setParentId((e.currentTarget as HTMLSelectElement).value)
                }
              >
                <s-option value="">— No parent (root category)</s-option>
                {options.map((opt) => (
                  <s-option key={opt.id} value={String(opt.id)}>
                    {opt.label}
                  </s-option>
                ))}
              </s-select>
            </div>
          )}

          {/* Subcategories — only when creating a root category */}
          {isCreatingRoot && (
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#202223", marginBottom: "8px" }}>
                Subcategories <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
              </div>

              {/* Chips for added subcategories */}
              {subNames.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                  {subNames.map((n) => (
                    <span
                      key={n}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        background: "#edf9f4", border: "1px solid #a3d9be",
                        borderRadius: "20px", padding: "3px 8px 3px 10px",
                        fontSize: "12px", color: "#006e52", fontWeight: 500,
                      }}
                    >
                      {n}
                      <button
                        type="button"
                        onClick={() => removeSub(n)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          padding: 0, color: "#65a58f", fontSize: "16px", lineHeight: 1,
                          display: "flex", alignItems: "center",
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={subInput}
                  placeholder="Subcategory name…"
                  onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter") { e.preventDefault(); addSub(); }
                  }}
                  style={{
                    flex: 1, fontSize: "13px", padding: "7px 10px",
                    border: "1px solid #d1d5db", borderRadius: "6px",
                    outline: "none", fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  onClick={addSub}
                  style={{
                    background: "#f3f4f6", border: "1px solid #d1d5db",
                    borderRadius: "6px", padding: "7px 14px",
                    cursor: "pointer", fontSize: "13px", fontWeight: 500,
                    color: "#374151", whiteSpace: "nowrap",
                  }}
                >
                  + Add
                </button>
              </div>
            </div>
          )}

          <div>
            <s-text>Category image (optional)</s-text>
            <FileUpload
              label=""
              accept="image/*"
              onComplete={setImageUrl}
              currentUrl={imageUrl || undefined}
            />
          </div>
        </s-stack>
      </div>

      <div style={footerStyle}>
        <s-button variant="secondary" onClick={dismiss} disabled={saving}>
          Cancel
        </s-button>
        <s-button variant="primary" loading={saving} onClick={handleSave}>
          Save
        </s-button>
      </div>
    </dialog>
  );
}

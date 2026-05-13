import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { CategoryModal, type CategoryItem } from "../components/CategoryModal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";

  const categories = await db.category.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    include: {
      parent: true,
      children: true,
      _count: { select: { diagrams: true } },
    },
    orderBy: { name: "asc" },
  });

  return { categories, search };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const name = (formData.get("name") as string)?.trim();
    if (!name) return { errors: { name: "Name is required" } };

    const parentId = formData.get("parentId");
    const imageUrl = formData.get("imageUrl") as string | null;

    const category = await db.category.create({
      data: {
        name,
        imageUrl: imageUrl || null,
        parentId: parentId ? Number(parentId) : null,
      },
    });

    // Create subcategories submitted alongside the root category
    const subcategoryNamesRaw = formData.get("subcategoryNames") as string | null;
    if (subcategoryNamesRaw) {
      try {
        const subNames: string[] = JSON.parse(subcategoryNamesRaw);
        await Promise.all(
          subNames
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n) => db.category.create({ data: { name: n, parentId: category.id } })),
        );
      } catch { /* ignore parse errors */ }
    }

    return { success: true };
  }

  if (intent === "update") {
    const id = Number(formData.get("id"));
    const name = (formData.get("name") as string)?.trim();
    if (!name) return { errors: { name: "Name is required" } };

    const parentId = formData.get("parentId");
    const imageUrl = formData.get("imageUrl") as string | null;

    await db.category.update({
      where: { id },
      data: {
        name,
        imageUrl: imageUrl || null,
        parentId: parentId ? Number(parentId) : null,
      },
    });
    return { success: true };
  }

  if (intent === "delete") {
    const id = Number(formData.get("id"));

    // Collect all descendant category IDs (BFS)
    const allCats = await db.category.findMany({ select: { id: true, parentId: true } });
    const toDelete = new Set([id]);
    const queue = [id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const cat of allCats) {
        if (cat.parentId === cur && !toDelete.has(cat.id)) {
          toDelete.add(cat.id);
          queue.push(cat.id);
        }
      }
    }
    const allIds = Array.from(toDelete);

    // Delete all diagrams linked to any of these categories (cascades DiagramCategory + DiagramProduct)
    const diagramLinks = await db.diagramCategory.findMany({
      where: { categoryId: { in: allIds } },
      select: { diagramId: true },
    });
    const diagramIds = [...new Set(diagramLinks.map((dc) => dc.diagramId))];
    if (diagramIds.length > 0) {
      await db.diagram.deleteMany({ where: { id: { in: diagramIds } } });
    }

    // Delete categories leaf-first to respect FK constraints
    const parentOf = new Map(allCats.map((c) => [c.id, c.parentId]));
    let remaining = new Set(allIds);
    while (remaining.size > 0) {
      const leaves = Array.from(remaining).filter(
        (rid) => !Array.from(remaining).some((other) => parentOf.get(other) === rid),
      );
      if (leaves.length === 0) break;
      await db.category.deleteMany({ where: { id: { in: leaves } } });
      for (const leaf of leaves) remaining.delete(leaf);
    }

    return { success: true };
  }

  return { errors: { general: "Unknown intent" } };
};

type LoadedCategory = Awaited<ReturnType<typeof loader>>["categories"][number];
type TreeNode = LoadedCategory & { treeChildren: TreeNode[] };

function buildTree(categories: LoadedCategory[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const cat of categories) map.set(cat.id, { ...cat, treeChildren: [] });

  const roots: TreeNode[] = [];
  for (const [, node] of map) {
    if (!node.parentId || !map.has(node.parentId)) {
      roots.push(node);
    } else {
      map.get(node.parentId)!.treeChildren.push(node);
    }
  }

  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sort(n.treeChildren);
  }
  sort(roots);
  return roots;
}

// ─── Shared modal styles ──────────────────────────────────────────────────────

const modalDialogStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "8px",
  padding: 0,
  maxWidth: "500px",
  width: "90vw",
  boxShadow: "0 4px 20px rgba(0,0,0,.22)",
  background: "#fff",
  color: "inherit",
  fontFamily: "inherit",
};

function AppModal({ heading, onHide, children }: {
  heading: string;
  onHide: () => void;
  children: (dismiss: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  const dismiss = useCallback(() => { ref.current?.close(); }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();

    const onClose = () => onHideRef.current();
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

  return (
    <dialog ref={ref} className="app-modal" style={modalDialogStyle}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", borderBottom: "1px solid #e1e3e5",
      }}>
        <span style={{ fontSize: "16px", fontWeight: 600, color: "#202223" }}>{heading}</span>
        <button onClick={dismiss} aria-label="Close" style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "4px 8px", borderRadius: "4px", fontSize: "18px", lineHeight: 1, color: "#6d7175",
        }}>✕</button>
      </div>
      <div style={{ padding: "20px" }}>{children(dismiss)}</div>
    </dialog>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a1 1 0 0 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM7 8a1 1 0 0 1 2 0v6a1 1 0 0 1-2 0V8zm5-1a1 1 0 0 0-1 1v6a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1z" />
    </svg>
  );
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d={up
        ? "M14.707 12.707a1 1 0 0 1-1.414 0L10 9.414l-3.293 3.293a1 1 0 0 1-1.414-1.414l4-4a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1 0 1.414z"
        : "M5.293 7.293a1 1 0 0 1 1.414 0L10 10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 0-1.414z"
      } />
    </svg>
  );
}

function FolderIcon({ size = 22, color = "#c0c4c9" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M3 7a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293L11.707 6.7A1 1 0 0 0 12.414 7H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function IconBtn({ onClick, title, color = "#6b7280", children }: {
  onClick: () => void;
  title: string;
  color?: string;
  children: ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? `${color}22` : "transparent",
        border: "none",
        borderRadius: "5px",
        padding: "5px",
        cursor: "pointer",
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function AddSubBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title="Add subcategory"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "#dcf5ed" : "#edf9f4",
        border: "1px solid #a3d9be",
        borderRadius: "20px",
        padding: "3px 8px 3px 5px",
        cursor: "pointer",
        fontSize: "11px",
        fontWeight: 600,
        color: "#1a7a54",
        display: "flex",
        alignItems: "center",
        gap: "3px",
        lineHeight: "16px",
        flexShrink: 0,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" />
      </svg>
      Sub
    </button>
  );
}

// ─── Tree Row (Notion-style) ──────────────────────────────────────────────────

const FOLDER_COLORS = ["#f59e0b", "#6366f1", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

function TreeRow({ node, depth, onEdit, onDelete, onAddChild, rootColorIndex = 0 }: {
  node: TreeNode;
  depth: number;
  onEdit: (cat: LoadedCategory) => void;
  onDelete: (cat: LoadedCategory) => void;
  onAddChild: (parentId: number) => void;
  rootColorIndex?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hasChildren = node.treeChildren.length > 0;
  const isRoot = depth === 0;

  // Root gets a warm accent colour; deeper levels fade to grey
  const iconColor = isRoot
    ? FOLDER_COLORS[rootColorIndex % FOLDER_COLORS.length]
    : depth === 1 ? "#94a3b8" : "#c4ccd5";

  // Badge: prefer child count, else diagram count
  const badge = hasChildren
    ? node.treeChildren.length
    : node._count.diagrams > 0 ? node._count.diagrams : null;

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: `5px 10px 5px ${14 + depth * 20}px`,
          borderRadius: "6px",
          background: hovered ? "#f3f4f6" : "transparent",
          cursor: "default",
          minHeight: "34px",
        }}
      >
        {/* Chevron — reserves space even when no children so names align */}
        <div style={{ width: 18, height: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hasChildren ? (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#9ca3af", display: "flex" }}
            >
              <ChevronIcon up={expanded} />
            </button>
          ) : null}
        </div>

        {/* Folder icon or tiny image */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
          {node.imageUrl ? (
            <img
              src={node.imageUrl} alt=""
              style={{ width: isRoot ? 20 : 16, height: isRoot ? 20 : 16, borderRadius: "3px", objectFit: "cover" }}
            />
          ) : (
            <FolderIcon size={isRoot ? 18 : 16} color={iconColor} />
          )}
        </div>

        {/* Name */}
        <span style={{
          flex: 1,
          fontSize: isRoot ? "14px" : "13px",
          fontWeight: isRoot ? 600 : 400,
          color: "#111827",
          lineHeight: "1.4",
          wordBreak: "break-word",
        }}>
          {node.name}
        </span>

        {/* Badge when idle, actions when hovered */}
        {hovered ? (
          <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
            <AddSubBtn onClick={() => onAddChild(node.id)} />
            <IconBtn onClick={() => onEdit(node)} title="Edit category" color="#63c49a">
              <PencilIcon />
            </IconBtn>
            <IconBtn onClick={() => onDelete(node)} title="Delete category" color="#f0877a">
              <TrashIcon />
            </IconBtn>
          </div>
        ) : (
          badge !== null && (
            <span style={{
              background: "#f1f5f9",
              color: "#64748b",
              fontSize: "11px",
              fontWeight: 500,
              padding: "1px 8px",
              borderRadius: "10px",
              flexShrink: 0,
            }}>
              {badge}
            </span>
          )
        )}
      </div>

      {/* Children — same component, deeper indent */}
      {hasChildren && expanded && node.treeChildren.map(child => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          rootColorIndex={rootColorIndex}
        />
      ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { categories, search } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [modalOpen, setModalOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryItem | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoadedCategory | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const allCategories: CategoryItem[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    imageUrl: c.imageUrl,
    parentId: c.parentId,
  }));

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(""), 6000);
    return () => clearTimeout(t);
  }, [successMessage]);

  function openCreate() {
    setEditCategory(null);
    setDefaultParentId(null);
    setModalOpen(true);
  }

  function openCreateWithParent(parentId: number) {
    setEditCategory(null);
    setDefaultParentId(parentId);
    setModalOpen(true);
  }

  function openEdit(cat: LoadedCategory) {
    setEditCategory({
      id: cat.id,
      name: cat.name,
      imageUrl: cat.imageUrl,
      parentId: cat.parentId,
    });
    setDefaultParentId(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditCategory(null);
    setDefaultParentId(null);
  }

  function handleSaved(msg: string) {
    setSuccessMessage(msg);
    closeModal();
    navigate(".", { replace: true });
  }

  function handleDelete(cat: LoadedCategory) {
    setDeleteTarget(cat);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", String(deleteTarget.id));
    await fetch(window.location.pathname, { method: "POST", body: fd });
    setSuccessMessage(`"${deleteTarget.name}" deleted.`);
    setDeleteTarget(null);
    navigate(".", { replace: true });
  }

  function updateSearch(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set("search", value);
    else params.delete("search");
    navigate(`?${params.toString()}`, { replace: true });
  }

  const tree = buildTree(categories as LoadedCategory[]);
  const totalCount = categories.length;

  return (
    <s-page heading="Categories">
      <s-button slot="primary-action" variant="primary" onClick={openCreate}>
        Create category
      </s-button>

      <s-section>
        {successMessage && (
          <div style={{ marginBottom: "16px" }}>
            <s-banner tone="success">{successMessage}</s-banner>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <s-search-field
              label="Search categories"
              value={search}
              onInput={(e: Event) =>
                updateSearch((e.currentTarget as HTMLInputElement).value)
              }
              placeholder="Search by name…"
            />
          </div>
          {!search && totalCount > 0 && (
            <div style={{ fontSize: "13px", color: "#6d7175", whiteSpace: "nowrap" }}>
              {totalCount} categor{totalCount !== 1 ? "ies" : "y"} · {tree.length} root
            </div>
          )}
        </div>

        {tree.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>📂</div>
            <s-text>
              {search
                ? `No categories match "${search}".`
                : `No categories yet. Click "Add category" to create one.`}
            </s-text>
          </div>
        ) : (
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            background: "#fff",
            overflow: "hidden",
            padding: "6px",
          }}>
            {tree.map((root, i) => (
              <div key={root.id}>
                {i > 0 && (
                  <div style={{ height: "1px", background: "#f1f5f9", margin: "2px 10px" }} />
                )}
                <TreeRow
                  node={root}
                  depth={0}
                  rootColorIndex={i}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onAddChild={openCreateWithParent}
                />
              </div>
            ))}
          </div>
        )}
      </s-section>

      <CategoryModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={handleSaved}
        allCategories={allCategories}
        editCategory={editCategory}
        defaultParentId={defaultParentId}
      />

      {deleteTarget && (() => {
        const hasChildren = (categories as LoadedCategory[]).some(c => c.parentId === deleteTarget.id);
        const hasDiagrams = deleteTarget._count.diagrams > 0;
        const warningMessage =
          hasDiagrams && hasChildren
            ? `"${deleteTarget.name}" has subcategories and is assigned to ${deleteTarget._count.diagrams} diagram(s). Deleting it will also delete all subcategories and those diagrams. This cannot be undone.`
            : hasDiagrams
            ? `"${deleteTarget.name}" is assigned to ${deleteTarget._count.diagrams} diagram(s). Deleting it will also delete all those diagrams. This cannot be undone.`
            : hasChildren
            ? `"${deleteTarget.name}" has subcategories. Deleting it will also delete all subcategories. This cannot be undone.`
            : null;

        return (
          <AppModal heading="Delete category" onHide={() => setDeleteTarget(null)}>
            {(dismiss) => (
              <>
                {warningMessage ? (
                  <div>
                    <s-banner tone="warning">{warningMessage}</s-banner>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "14px", color: "#202223" }}>
                    Are you sure you want to delete &ldquo;{deleteTarget.name}&rdquo;? This cannot be undone.
                  </p>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                  <s-button variant="secondary" onClick={dismiss}>Cancel</s-button>
                  <s-button
                    variant="primary"
                    tone="critical"
                    onClick={() => { dismiss(); confirmDelete(); }}
                  >
                    Delete
                  </s-button>
                </div>
              </>
            )}
          </AppModal>
        );
      })()}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

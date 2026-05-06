import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams, useSubmit } from "react-router";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const categoryId = url.searchParams.get("categoryId") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));

  const where = {
    ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
    ...(categoryId ? { categories: { some: { categoryId: Number(categoryId) } } } : {}),
  };

  const [diagrams, total, categories] = await Promise.all([
    db.diagram.findMany({
      where,
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.diagram.count({ where }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return {
    diagrams,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    categories,
    search,
    categoryId,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "deleteSingle") {
    const id = Number(formData.get("id"));
    await db.diagram.delete({ where: { id } });
    return { success: true };
  }

  if (intent === "bulkDelete") {
    const ids = (formData.get("ids") as string).split(",").map(Number).filter(Boolean);
    await db.diagram.deleteMany({ where: { id: { in: ids } } });
    return { success: true };
  }

  return { errors: { general: "Unknown intent" } };
};

const modalDialogStyle: React.CSSProperties = {
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

function AppModal({ heading, onHide, children }: {
  heading: string;
  onHide: () => void;
  children: (dismiss: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  const dismiss = useCallback(() => {
    ref.current?.close();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();

    // "close" fires after dialog.close() or Escape — safe to unmount here.
    const onClose = () => onHideRef.current();
    // Intercept Escape so it routes through dialog.close() → "close" event.
    const onCancel = (e: Event) => { e.preventDefault(); dialog.close(); };
    // Backdrop click: click target is the <dialog> itself when outside content.
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
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        borderBottom: "1px solid #e1e3e5",
      }}>
        <span style={{ fontSize: "16px", fontWeight: 600, color: "#202223" }}>{heading}</span>
        <button
          onClick={dismiss}
          aria-label="Close"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "4px 8px", borderRadius: "4px",
            fontSize: "18px", lineHeight: 1, color: "#6d7175",
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: "20px" }}>
        {children(dismiss)}
      </div>
    </dialog>
  );
}

export default function DiagramsPage() {
  const { diagrams, page, totalPages, categories, search, categoryId } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();

  const [selected, setSelected] = useState<number[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const successParam = searchParams.get("success");
  const successMessage =
    successParam === "created" ? "Diagram created successfully." :
    successParam === "updated" ? "Diagram updated successfully." : "";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    navigate(`?${params.toString()}`, { replace: true });
  }

  function toggleSelect(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (selected.length === diagrams.length) {
      setSelected([]);
    } else {
      setSelected(diagrams.map((d) => d.id));
    }
  }

  function confirmDelete(id: number) {
    const fd = new FormData();
    fd.set("intent", "deleteSingle");
    fd.set("id", String(id));
    submit(fd, { method: "post" });
  }

  function confirmBulkDelete() {
    const fd = new FormData();
    fd.set("intent", "bulkDelete");
    fd.set("ids", selected.join(","));
    submit(fd, { method: "post" });
    setSelected([]);
  }

  const formatDate = (d: string | Date) =>
    new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <s-page heading="Diagrams">
      <s-button slot="primary-action" variant="primary" onClick={() => navigate("/app/diagrams/new")}>
        Create diagram
      </s-button>

      <s-section>
        {successMessage && (
          <div style={{ marginBottom: "16px" }}>
            <s-banner tone="success">{successMessage}</s-banner>
          </div>
        )}

        <s-stack direction="inline" gap="base">
          <s-search-field
            label="Search diagrams"
            value={search}
            onInput={(e: Event) =>
              updateParam("search", (e.currentTarget as HTMLInputElement).value)
            }
            placeholder="Search by title…"
          />
          <s-select
            label="Category"
            value={categoryId}
            onChange={(e: Event) =>
              updateParam("categoryId", (e.currentTarget as HTMLSelectElement).value)
            }
          >
            <s-option value="">All categories</s-option>
            {categories.map((c) => (
              <s-option key={c.id} value={String(c.id)}>
                {c.name}
              </s-option>
            ))}
          </s-select>
          {selected.length > 0 && (
            <s-button variant="secondary" tone="critical" onClick={() => setBulkModalOpen(true)}>
              Delete selected ({selected.length})
            </s-button>
          )}
        </s-stack>

        <s-table
          variant="auto"
          paginate={totalPages > 1}
          hasPreviousPage={page > 1}
          hasNextPage={page < totalPages}
          onPreviousPage={() => updateParam("page", String(page - 1))}
          onNextPage={() => updateParam("page", String(page + 1))}
        >
          <s-table-header-row>
            <s-table-header>
              {diagrams.length > 0 && (
                <input
                  type="checkbox"
                  checked={selected.length === diagrams.length && diagrams.length > 0}
                  onChange={toggleAll}
                  aria-label="Select all"
                  style={{ cursor: "pointer", width: 16, height: 16, accentColor: "#2c6ecb" }}
                />
              )}
            </s-table-header>
            <s-table-header>Image</s-table-header>
            <s-table-header>Title</s-table-header>
            <s-table-header>Category</s-table-header>
            <s-table-header>Parts</s-table-header>
            <s-table-header>Created</s-table-header>
            <s-table-header>Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {diagrams.length === 0 ? (
              <s-table-row>
                <s-table-cell>
                  <div style={{ padding: "24px 0", textAlign: "center" }}>
                    <s-text>
                      {search || categoryId
                        ? "No diagrams match your filters."
                        : "No diagrams yet. Click \"Create diagram\" to get started."}
                    </s-text>
                  </div>
                </s-table-cell>
              </s-table-row>
            ) : (
              diagrams.map((d) => (
                <s-table-row key={d.id}>
                  <s-table-cell>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={() => toggleSelect(d.id)}
                      aria-label={`Select ${d.title}`}
                      style={{ cursor: "pointer", width: 16, height: 16, accentColor: "#2c6ecb" }}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    {d.imageUrl && (
                      <s-thumbnail src={d.imageUrl} alt={d.title} size="small" />
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-link href={`/app/diagrams/${d.id}/edit`}>{d.title}</s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>
                      {d.categories.length > 0
                        ? d.categories.map((dc) => dc.category.name).join(", ")
                        : "—"}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge>{String(d._count.products)}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{formatDate(d.createdAt)}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <s-button
                        variant="secondary"
                        onClick={() => navigate(`/app/diagrams/${d.id}/edit`)}
                      >
                        Edit
                      </s-button>
                      <s-button
                        variant="tertiary"
                        onClick={() => setDeleteTarget(d.id)}
                      >
                        Delete
                      </s-button>
                    </div>
                  </s-table-cell>
                </s-table-row>
              ))
            )}
          </s-table-body>
        </s-table>
      </s-section>

      {/* Single delete modal */}
      {deleteTarget !== null && (
        <AppModal heading="Delete diagram" onHide={() => setDeleteTarget(null)}>
          {(dismiss) => (
            <>
              <s-text>Are you sure you want to delete this diagram? This cannot be undone.</s-text>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                <s-button variant="secondary" onClick={dismiss}>Cancel</s-button>
                <s-button
                  variant="primary"
                  tone="critical"
                  onClick={() => { dismiss(); confirmDelete(deleteTarget!); }}
                >
                  Delete
                </s-button>
              </div>
            </>
          )}
        </AppModal>
      )}

      {/* Bulk delete modal */}
      {bulkModalOpen && (
        <AppModal heading="Delete selected diagrams" onHide={() => setBulkModalOpen(false)}>
          {(dismiss) => (
            <>
              <s-text>
                Are you sure you want to delete {selected.length} diagram
                {selected.length !== 1 ? "s" : ""}? This cannot be undone.
              </s-text>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                <s-button variant="secondary" onClick={dismiss}>Cancel</s-button>
                <s-button
                  variant="primary"
                  tone="critical"
                  onClick={() => { dismiss(); confirmBulkDelete(); }}
                >
                  Delete all
                </s-button>
              </div>
            </>
          )}
        </AppModal>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

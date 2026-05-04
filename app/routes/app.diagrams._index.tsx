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
    ...(categoryId ? { categoryId: Number(categoryId) } : {}),
  };

  const [diagrams, total, categories] = await Promise.all([
    db.diagram.findMany({
      where,
      include: {
        category: true,
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

type ModalEl = HTMLElement & { showOverlay?: () => void; hideOverlay?: () => void };

function AppModal({ heading, onHide, children }: {
  heading: string;
  onHide: () => void;
  children: (dismiss: () => void) => ReactNode;
}) {
  const ref = useRef<ModalEl | null>(null);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onHideRef.current();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showOverlay?.();

    // s-modal may dispatch any of these events when the X button is clicked —
    // listen to all so it works regardless of Polaris version.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <s-modal ref={ref as any} heading={heading}>{children(dismiss)}</s-modal>;
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
                    <s-text>{d.category?.name ?? "—"}</s-text>
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
              <s-button
                slot="primary-action"
                variant="primary"
                tone="critical"
                onClick={() => { dismiss(); confirmDelete(deleteTarget!); }}
              >
                Delete
              </s-button>
              <s-button slot="secondary-actions" onClick={dismiss}>
                Cancel
              </s-button>
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
              <s-button
                slot="primary-action"
                variant="primary"
                tone="critical"
                onClick={() => { dismiss(); confirmBulkDelete(); }}
              >
                Delete all
              </s-button>
              <s-button slot="secondary-actions" onClick={dismiss}>
                Cancel
              </s-button>
            </>
          )}
        </AppModal>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

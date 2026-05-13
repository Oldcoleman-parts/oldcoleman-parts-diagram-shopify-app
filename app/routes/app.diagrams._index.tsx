import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  useSubmit,
} from "react-router";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const categoryId = url.searchParams.get("categoryId") ?? "";
  const categoryIdNum = parseInt(categoryId, 10);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));

  const where = {
    ...(search
      ? { title: { contains: search, mode: "insensitive" as const } }
      : {}),
    ...(categoryId !== "" && !isNaN(categoryIdNum) && categoryIdNum > 0
      ? { categories: { some: { categoryId: categoryIdNum } } }
      : {}),
  };

  const [diagrams, total, categories] = await Promise.all([
    db.diagram.findMany({
      where,
      include: {
        categories: {
          include: { category: { select: { id: true, name: true } } },
        },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.diagram.count({ where }),
    db.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { name: "asc" },
          include: { children: { orderBy: { name: "asc" } } },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    diagrams,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    categories,
    search,
    categoryId,
    shop,
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
    const ids = (formData.get("ids") as string)
      .split(",")
      .map(Number)
      .filter(Boolean);
    await db.diagram.deleteMany({ where: { id: { in: ids } } });
    return { success: true };
  }

  return { errors: { general: "Unknown intent" } };
};

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a1 1 0 0 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM7 8a1 1 0 0 1 2 0v6a1 1 0 0 1-2 0V8zm5-1a1 1 0 0 0-1 1v6a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1z" />
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
        padding: "6px",
        cursor: "pointer",
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

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

function AppModal({
  heading,
  onHide,
  children,
}: {
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
    const onCancel = (e: Event) => {
      e.preventDefault();
      dialog.close();
    };
    // Backdrop click: click target is the <dialog> itself when outside content.
    const onClick = (e: MouseEvent) => {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid #e1e3e5",
        }}
      >
        <span style={{ fontSize: "16px", fontWeight: 600, color: "#202223" }}>
          {heading}
        </span>
        <button
          onClick={dismiss}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "18px",
            lineHeight: 1,
            color: "#6d7175",
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: "20px" }}>{children(dismiss)}</div>
    </dialog>
  );
}

export default function DiagramsPage() {
  const { diagrams, page, totalPages, categories, search, categoryId, shop } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();

  const [selected, setSelected] = useState<number[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const successParam = searchParams.get("success");
  const successMessage =
    successParam === "created"
      ? "Diagram created successfully."
      : successParam === "updated"
        ? "Diagram updated successfully."
        : "";

  // Capture the message at mount time — never changes even after we strip the URL param
  const initialMsg = useRef(successMessage).current;
  const [showBanner, setShowBanner] = useState(!!initialMsg);

  useEffect(() => {
    if (!initialMsg) return;
    // Strip ?success= from URL so a page refresh doesn't re-show the banner
    const params = new URLSearchParams(window.location.search);
    params.delete("success");
    navigate({ search: params.toString() }, { replace: true });
    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => setShowBanner(false), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — intentionally runs once on mount only

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
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <s-page heading="Diagrams">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/diagrams/new")}
      >
        Create diagram
      </s-button>

      <s-section>
        {showBanner && initialMsg && (
          <div style={{ marginBottom: "16px" }}>
            <s-banner tone="success">{initialMsg}</s-banner>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <s-search-field
            label="Search diagrams"
            value={search}
            onInput={(e: Event) =>
              updateParam("search", (e.currentTarget as HTMLInputElement).value)
            }
            placeholder="Search by title…"
          />
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <s-select
                label="Category"
                value={categoryId}
                onChange={(e: Event) => {
                  const val = (e.target as HTMLSelectElement)?.value ?? "";
                  updateParam("categoryId", val);
                }}
              >
                <s-option value="">All categories</s-option>
                {categories.flatMap((parent) => [
                  <s-option
                    key={`parent-${parent.id}`}
                    value={String(parent.id)}
                  >
                    {parent.name}
                  </s-option>,
                  ...parent.children.flatMap((child) => [
                    <s-option
                      key={`child-${child.id}`}
                      value={String(child.id)}
                    >
                      {"   "}— {child.name}
                    </s-option>,
                    ...child.children.map((grandchild) => (
                      <s-option
                        key={`grandchild-${grandchild.id}`}
                        value={String(grandchild.id)}
                      >
                        {"      "}— {grandchild.name}
                      </s-option>
                    )),
                  ]),
                ])}
              </s-select>
            </div>
            {categoryId && (
              <button
                onClick={() => updateParam("categoryId", "")}
                style={{
                  background: "#fff",
                  border: "1.5px solid #2c6ecb",
                  borderRadius: "16px",
                  cursor: "pointer",
                  fontSize: "13px",
                  padding: "5px 14px",
                  color: "#2c6ecb",
                  fontWeight: 500,
                  marginBottom: "2px",
                  whiteSpace: "nowrap",
                  lineHeight: 1.4,
                }}
              >
                × Clear filter
              </button>
            )}
            {selected.length > 0 && (
              <s-button
                variant="secondary"
                tone="critical"
                onClick={() => setBulkModalOpen(true)}
              >
                Delete selected ({selected.length})
              </s-button>
            )}
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
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
                    checked={
                      selected.length === diagrams.length && diagrams.length > 0
                    }
                    onChange={toggleAll}
                    aria-label="Select all"
                    style={{
                      cursor: "pointer",
                      width: 16,
                      height: 16,
                      accentColor: "#2c6ecb",
                    }}
                  />
                )}
              </s-table-header>
              <s-table-header>Title</s-table-header>
              <s-table-header>Image</s-table-header>
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
                          : 'No diagrams yet. Click "Create diagram" to get started.'}
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
                        style={{
                          cursor: "pointer",
                          width: 16,
                          height: 16,
                          accentColor: "#2c6ecb",
                        }}
                      />
                    </s-table-cell>
                    <s-table-cell>
                      <s-link href={`/app/diagrams/${d.id}/edit`}>
                        {d.title}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      {d.imageUrl && (
                        <s-thumbnail
                          src={d.imageUrl}
                          alt={d.title}
                          size="small"
                        />
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-text>
                        {d.categories.length > 0
                          ? d.categories
                              .map((dc) => dc.category.name)
                              .join(", ")
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
                      <div style={{ display: "flex", gap: "2px" }}>
                        <IconBtn
                          title="View on storefront"
                          color="#85b4f0"
                          onClick={() => window.open(`https://${shop}/apps/diagram/${d.handle}`, "_blank")}
                        >
                          <EyeIcon />
                        </IconBtn>
                        <IconBtn
                          title="Edit"
                          color="#63c49a"
                          onClick={() => navigate(`/app/diagrams/${d.id}/edit`)}
                        >
                          <PencilIcon />
                        </IconBtn>
                        <IconBtn
                          title="Delete"
                          color="#f0877a"
                          onClick={() => setDeleteTarget(d.id)}
                        >
                          <TrashIcon />
                        </IconBtn>
                      </div>
                    </s-table-cell>
                  </s-table-row>
                ))
              )}
            </s-table-body>
          </s-table>
        </div>
      </s-section>

      {/* Single delete modal */}
      {deleteTarget !== null && (
        <AppModal heading="Delete diagram" onHide={() => setDeleteTarget(null)}>
          {(dismiss) => (
            <>
              <s-text>
                Are you sure you want to delete this diagram? This cannot be
                undone.
              </s-text>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "20px",
                }}
              >
                <s-button variant="secondary" onClick={dismiss}>
                  Cancel
                </s-button>
                <s-button
                  variant="primary"
                  tone="critical"
                  onClick={() => {
                    dismiss();
                    confirmDelete(deleteTarget!);
                  }}
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
        <AppModal
          heading="Delete selected diagrams"
          onHide={() => setBulkModalOpen(false)}
        >
          {(dismiss) => (
            <>
              <s-text>
                Are you sure you want to delete {selected.length} diagram
                {selected.length !== 1 ? "s" : ""}? This cannot be undone.
              </s-text>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "20px",
                }}
              >
                <s-button variant="secondary" onClick={dismiss}>
                  Cancel
                </s-button>
                <s-button
                  variant="primary"
                  tone="critical"
                  onClick={() => {
                    dismiss();
                    confirmBulkDelete();
                  }}
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

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

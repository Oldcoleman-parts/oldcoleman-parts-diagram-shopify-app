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

    await db.category.create({
      data: {
        name,
        imageUrl: imageUrl || null,
        parentId: parentId ? Number(parentId) : null,
      },
    });
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
    const category = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { diagrams: true } } },
    });
    if (!category) return { errors: { general: "Category not found" } };
    if (category._count.diagrams > 0) {
      return {
        errors: {
          general: `Cannot delete "${category.name}" — it has ${category._count.diagrams} diagram(s). Re-assign or delete them first.`,
        },
      };
    }
    await db.category.delete({ where: { id } });
    return { success: true };
  }

  return { errors: { general: "Unknown intent" } };
};

type LoadedCategory = Awaited<ReturnType<typeof loader>>["categories"][number];

function flattenCategories(categories: LoadedCategory[]): LoadedCategory[] {
  const roots = categories.filter((c) => !c.parentId);
  const result: LoadedCategory[] = [];
  for (const root of roots) {
    result.push(root);
    for (const child of categories.filter((c) => c.parentId === root.id)) {
      result.push(child);
    }
  }
  return result;
}

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

export default function CategoriesPage() {
  const { categories, search } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [modalOpen, setModalOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoadedCategory | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const rootCategories: CategoryItem[] = categories
    .filter((c) => !c.parentId)
    .map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl, parentId: c.parentId }));

  function openCreate() {
    setEditCategory(null);
    setModalOpen(true);
  }

  function openEdit(cat: LoadedCategory) {
    setEditCategory({
      id: cat.id,
      name: cat.name,
      imageUrl: cat.imageUrl,
      parentId: cat.parentId,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditCategory(null);
  }

  async function handleDelete(cat: LoadedCategory) {
    if (cat._count.diagrams > 0) {
      setDeleteError(
        `Cannot delete "${cat.name}" — it has ${cat._count.diagrams} diagram(s). Re-assign or delete them first.`,
      );
      setDeleteTarget(cat);
      return;
    }
    setDeleteError("");
    setDeleteTarget(cat);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", String(deleteTarget.id));
    await fetch(window.location.pathname, { method: "POST", body: fd });
    navigate(".", { replace: true });
  }

  function updateSearch(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    navigate(`?${params.toString()}`, { replace: true });
  }

  const sorted = flattenCategories(categories as LoadedCategory[]);

  return (
    <s-page heading="Categories">
      <s-button slot="primary-action" variant="primary" onClick={openCreate}>
        Add category
      </s-button>

      <s-section>
        <s-search-field
          label="Search categories"
          value={search}
          onInput={(e: Event) =>
            updateSearch((e.currentTarget as HTMLInputElement).value)
          }
          placeholder="Search by name…"
        />
        {sorted.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <s-text>
              {search
                ? `No categories match "${search}".`
                : `No categories yet. Click "Add category" to create one.`}
            </s-text>
          </div>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header>Image</s-table-header>
              <s-table-header>Name</s-table-header>
              <s-table-header>Parent</s-table-header>
              <s-table-header>Diagrams</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {sorted.map((cat) => (
                <s-table-row key={cat.id}>
                  <s-table-cell>
                    {cat.imageUrl && (
                      <s-thumbnail src={cat.imageUrl} alt={cat.name} size="small" />
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {cat.parentId ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", paddingLeft: "16px" }}>
                        {/* <span style={{ color: "#8c9196" }}>—</span> */}
                        <s-text>{cat.name}</s-text>
                      </span>
                    ) : (
                      <s-text>{cat.name}</s-text>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{cat.parent?.name ?? "N/A"}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge>{String(cat._count.diagrams)}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <s-button variant="secondary" onClick={() => openEdit(cat)}>
                        Edit
                      </s-button>
                      <s-button variant="tertiary" onClick={() => handleDelete(cat)}>
                        Delete
                      </s-button>
                    </div>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <CategoryModal
        open={modalOpen}
        onClose={closeModal}
        rootCategories={rootCategories}
        editCategory={editCategory}
      />

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <AppModal heading="Delete category" onHide={() => setDeleteTarget(null)}>
          {(dismiss) => (
            <>
              {deleteError ? (
                <s-banner tone="critical">{deleteError}</s-banner>
              ) : (
                <s-text>
                  Are you sure you want to delete "{deleteTarget.name}"? This cannot be
                  undone.
                </s-text>
              )}

              {!deleteError && (
                <s-button
                  slot="primary-action"
                  variant="primary"
                  tone="critical"
                  onClick={() => { dismiss(); confirmDelete(); }}
                >
                  Delete
                </s-button>
              )}
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

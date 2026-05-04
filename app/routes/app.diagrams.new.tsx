import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DiagramForm, type FlatCategory } from "../components/DiagramForm";
import type { SelectedProduct } from "../components/ProductPicker";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const categories = await db.category.findMany({ orderBy: { name: "asc" } });
  return { categories };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();

  const title = (formData.get("title") as string)?.trim();
  const handle = (formData.get("handle") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const imageUrl = (formData.get("imageUrl") as string) || null;
  const categoryId = formData.get("categoryId");
  const productsJson = formData.get("products") as string;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required";
  if (!handle || !/^[a-z0-9-]+$/.test(handle)) errors.handle = "Handle must be lowercase letters, numbers, and hyphens only";
  if (Object.keys(errors).length > 0) return { errors };

  const products: SelectedProduct[] = productsJson ? JSON.parse(productsJson) : [];

  // Server-side enforcement: if products exist, never store fileUrl
  const fileUrl = products.length > 0 ? null : (formData.get("fileUrl") as string) || null;

  await db.$transaction(async (tx) => {
    const diagram = await tx.diagram.create({
      data: {
        title,
        handle,
        description,
        imageUrl,
        fileUrl,
        categoryId: categoryId ? Number(categoryId) : null,
      },
    });

    if (products.length > 0) {
      await tx.diagramProduct.createMany({
        data: products.map((p) => ({
          diagramId: diagram.id,
          productId: p.productId,
          productTitle: p.productTitle,
          productHandle: p.productHandle,
          productImageUrl: p.productImageUrl || null,
          productPrice: p.productPrice || null,
          variantId: p.variantId,
          sortOrder: p.sortOrder,
        })),
      });
    }
  });

  return redirect("/app/diagrams");
};

function flattenCategories(
  categories: { id: number; name: string; parentId: number | null }[],
): FlatCategory[] {
  const roots = categories.filter((c) => !c.parentId);
  const result: FlatCategory[] = [];
  for (const root of roots) {
    result.push({ id: root.id, name: root.name, displayName: root.name });
    for (const child of categories.filter((c) => c.parentId === root.id)) {
      result.push({ id: child.id, name: child.name, displayName: `  ${child.name}` });
    }
  }
  // Include any categories not already added
  for (const cat of categories) {
    if (!result.find((r) => r.id === cat.id)) {
      result.push({ id: cat.id, name: cat.name, displayName: cat.name });
    }
  }
  return result;
}

export default function NewDiagramPage() {
  const { categories } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Create diagram">
      <s-button slot="secondary-actions" onClick={() => navigate("/app/diagrams")}>
        Cancel
      </s-button>

      <s-section>
        <DiagramForm
          categories={flattenCategories(categories)}
          isSubmitting={isSubmitting}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigation, useNavigate, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DiagramForm } from "../components/DiagramForm";
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
  const categoryIdsJson = formData.get("categoryIds") as string;
  const categoryIds: number[] = categoryIdsJson ? JSON.parse(categoryIdsJson) : [];
  const productsJson = formData.get("products") as string;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required";
  if (!handle || !/^[a-z0-9-]+$/.test(handle))
    errors.handle = "Handle must be lowercase letters, numbers, and hyphens only";
  if (Object.keys(errors).length > 0) return { errors };

  const products: SelectedProduct[] = productsJson ? JSON.parse(productsJson) : [];
  const fileUrl = products.length > 0 ? null : (formData.get("fileUrl") as string) || null;

  await db.$transaction(async (tx) => {
    const diagram = await tx.diagram.create({
      data: { title, handle, description, imageUrl, fileUrl },
    });

    if (categoryIds.length > 0) {
      await tx.diagramCategory.createMany({
        data: categoryIds.map((categoryId) => ({ diagramId: diagram.id, categoryId })),
        skipDuplicates: true,
      });
    }

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

  return redirect("/app/diagrams?success=created");
};

export default function NewDiagramPage() {
  const { categories } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const actionData = useActionData<{ errors?: Record<string, string> }>();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Create diagram">
      <s-button slot="secondary-actions" onClick={() => navigate("/app/diagrams")}>
        Cancel
      </s-button>

      <s-section>
        <DiagramForm
          allCategories={categories}
          isSubmitting={isSubmitting}
          errors={actionData?.errors}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

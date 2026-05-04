import { useState } from "react";
import { Form } from "react-router";
import { FileUpload } from "./FileUpload";
import { ProductPicker, type SelectedProduct } from "./ProductPicker";

export interface FlatCategory {
  id: number;
  name: string;
  displayName: string; // indented for children
}

interface DiagramData {
  id: number;
  title: string;
  handle: string;
  description: string | null;
  imageUrl: string | null;
  fileUrl: string | null;
  categoryId: number | null;
  products: SelectedProduct[];
}

interface Props {
  diagram?: DiagramData;
  categories: FlatCategory[];
  isSubmitting: boolean;
}

function toHandle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function DiagramForm({ diagram, categories, isSubmitting }: Props) {
  const [title, setTitle] = useState(diagram?.title ?? "");
  const [handle, setHandle] = useState(diagram?.handle ?? "");
  const [handleTouched, setHandleTouched] = useState(!!diagram);
  const [description, setDescription] = useState(diagram?.description ?? "");
  const [imageUrl, setImageUrl] = useState(diagram?.imageUrl ?? "");
  const [fileUrl, setFileUrl] = useState(diagram?.fileUrl ?? "");
  const [categoryId, setCategoryId] = useState(
    diagram?.categoryId ? String(diagram.categoryId) : "",
  );
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>(
    diagram?.products ?? [],
  );

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!handleTouched) {
      setHandle(toHandle(value));
    }
  }

  function handleProductsChange(products: SelectedProduct[]) {
    setSelectedProducts(products);
    // Clear fileUrl when products are added (mutually exclusive per spec)
    if (products.length > 0) {
      setFileUrl("");
    }
  }

  const hasProducts = selectedProducts.length > 0;

  return (
    <Form method="post">
      <s-stack direction="block" gap="base">
        <s-text-field
          label="Title"
          name="title"
          value={title}
          onInput={(e: Event) =>
            handleTitleChange((e.currentTarget as HTMLInputElement).value)
          }
          required
        />

        <div>
          <s-text-field
            label="Handle"
            name="handle"
            value={handle}
            onInput={(e: Event) => {
              setHandle((e.currentTarget as HTMLInputElement).value);
              setHandleTouched(true);
            }}
            details="URL slug — auto-generated from title, must be unique"
          />
          {handle && (
            <s-text>
              Storefront URL:{" "}
              <s-link href={`/apps/diagram/${handle}`} target="_blank">
                /apps/diagram/{handle}
              </s-link>
            </s-text>
          )}
        </div>

        <s-text-area
          label="Description"
          name="description"
          value={description}
          onInput={(e: Event) =>
            setDescription((e.currentTarget as HTMLTextAreaElement).value)
          }
        />

        <div>
          <s-select
            label="Category"
            name="categoryId"
            value={categoryId}
            onChange={(e: Event) =>
              setCategoryId((e.currentTarget as HTMLSelectElement).value)
            }
          >
            <s-option value="">— No category —</s-option>
            {categories.map((c) => (
              <s-option key={c.id} value={String(c.id)}>
                {c.displayName}
              </s-option>
            ))}
          </s-select>
          <s-text>
            <s-link href="/app/categories">Manage categories</s-link>
          </s-text>
        </div>

        <div>
          <s-heading>Diagram image</s-heading>
          <input type="hidden" name="imageUrl" value={imageUrl} />
          <FileUpload
            label="Diagram image"
            accept="image/*"
            onComplete={setImageUrl}
            currentUrl={imageUrl || undefined}
          />
        </div>

        <div>
          <s-heading>Products (parts)</s-heading>
          <input
            type="hidden"
            name="products"
            value={JSON.stringify(selectedProducts)}
          />
          <ProductPicker
            selectedProducts={selectedProducts}
            onChange={handleProductsChange}
          />
        </div>

        {hasProducts ? (
          <s-banner tone="info">
            Document upload is only available for diagrams without linked parts.
          </s-banner>
        ) : (
          <div>
            <s-heading>PDF document</s-heading>
            <s-text>Shown on the storefront when no parts are linked.</s-text>
            <input type="hidden" name="fileUrl" value={fileUrl} />
            <FileUpload
              label="PDF document"
              accept=".pdf,application/pdf"
              onComplete={setFileUrl}
              currentUrl={fileUrl || undefined}
            />
          </div>
        )}

        {/* Ensure fileUrl is always sent (empty string when products present) */}
        {hasProducts && <input type="hidden" name="fileUrl" value="" />}

        <s-button
          variant="primary"
          type="submit"
          loading={isSubmitting}
        >
          {diagram ? "Save changes" : "Create diagram"}
        </s-button>
      </s-stack>
    </Form>
  );
}

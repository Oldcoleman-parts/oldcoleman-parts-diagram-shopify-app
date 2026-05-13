import { useState } from "react";
import { Form } from "react-router";
import { FileUpload } from "./FileUpload";
import { ProductPicker, type SelectedProduct } from "./ProductPicker";
import { CategoryPicker, type CategoryPickerItem } from "./CategoryPicker";

interface DiagramData {
  id: number;
  title: string;
  handle: string;
  description: string | null;
  imageUrl: string | null;
  fileUrl: string | null;
  categoryIds: number[];
  products: SelectedProduct[];
}

interface Props {
  diagram?: DiagramData;
  allCategories: CategoryPickerItem[];
  isSubmitting: boolean;
  errors?: Record<string, string>;
}

function toHandle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const sectionLabel: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#202223",
  display: "block",
  marginBottom: "8px",
};

export function DiagramForm({ diagram, allCategories, isSubmitting, errors = {} }: Props) {
  const [title, setTitle] = useState(diagram?.title ?? "");
  const [handle, setHandle] = useState(diagram?.handle ?? "");
  const [handleTouched, setHandleTouched] = useState(!!diagram);
  const [description, setDescription] = useState(diagram?.description ?? "");
  const [imageUrl, setImageUrl] = useState(diagram?.imageUrl ?? "");
  const [fileUrl, setFileUrl] = useState(diagram?.fileUrl ?? "");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(
    diagram?.categoryIds ?? [],
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
    if (products.length > 0) setFileUrl("");
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
          error={errors.title}
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
            error={errors.handle}
          />
          {handle && (
            <s-text>
              Storefront URL:{" "}
              <s-link href={`https://old-coleman-parts.myshopify.com/apps/diagram/${handle}`} target="_blank">
                https://old-coleman-parts.myshopify.com/apps/diagram/{handle}
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

        {/* Categories */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#202223" }}>
              Categories
            </span>
            <a href="/app/categories" style={{ fontSize: "12px", color: "#2c6ecb", textDecoration: "none" }}>
              Manage categories →
            </a>
          </div>
          <input type="hidden" name="categoryIds" value={JSON.stringify(selectedCategoryIds)} />
          <CategoryPicker
            allCategories={allCategories}
            selectedIds={selectedCategoryIds}
            onChange={setSelectedCategoryIds}
          />
          {selectedCategoryIds.length === 0 && (
            <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "6px" }}>
              Select one or more categories to help customers filter diagrams.
            </div>
          )}
        </div>

        {/* Diagram image */}
        <div>
          <span style={sectionLabel}>Diagram image</span>
          <input type="hidden" name="imageUrl" value={imageUrl} />
          <FileUpload
            label=""
            accept="image/*"
            onComplete={setImageUrl}
            currentUrl={imageUrl || undefined}
          />
        </div>

        {/* Products */}
        <div style={{ paddingTop: "4px" }}>
          <input type="hidden" name="products" value={JSON.stringify(selectedProducts)} />
          <ProductPicker
            selectedProducts={selectedProducts}
            onChange={handleProductsChange}
          />
        </div>

        {/* PDF document — hidden when products are linked */}
        {hasProducts ? (
          <input type="hidden" name="fileUrl" value="" />
        ) : (
          <div style={{
            border: "1px solid #e1e3e5",
            borderRadius: "8px",
            padding: "16px",
            background: "#fafafa",
          }}>
            <span style={sectionLabel}>PDF document</span>
            <p style={{ fontSize: "13px", color: "#6d7175", margin: "0 0 12px" }}>
              If products are linked to this diagram, the PDF will not be uploaded.
            </p>
            <input type="hidden" name="fileUrl" value={fileUrl} />
            <FileUpload
              label=""
              accept=".pdf,application/pdf"
              onComplete={setFileUrl}
              currentUrl={fileUrl || undefined}
            />
          </div>
        )}

        <div style={{ borderTop: "1px solid #e1e3e5", paddingTop: "16px" }}>
          <s-button variant="primary" type="submit" loading={isSubmitting}>
            {diagram ? "Save changes" : "Create diagram"}
          </s-button>
        </div>

      </s-stack>
    </Form>
  );
}

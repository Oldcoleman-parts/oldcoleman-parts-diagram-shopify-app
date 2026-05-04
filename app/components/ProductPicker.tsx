import { useAppBridge } from "@shopify/app-bridge-react";
import type { Product } from "@shopify/app-bridge-types";

export interface SelectedProduct {
  productId: string;
  productTitle: string;
  productHandle: string;
  productImageUrl: string;
  productPrice: string;
  variantId: string;
  sortOrder: number;
}

interface Props {
  selectedProducts: SelectedProduct[];
  onChange: (products: SelectedProduct[]) => void;
}

export function ProductPicker({ selectedProducts, onChange }: Props) {
  const shopify = useAppBridge();

  async function openPicker() {
    const selectionIds = selectedProducts.map((p) => ({
      id: `gid://shopify/Product/${p.productId}`,
    }));

    const result = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
      selectionIds,
    });

    if (!result) return; // user cancelled

    const products: SelectedProduct[] = (result as Product[]).map((p, i) => ({
      productId: p.id.split("/").pop() ?? p.id,
      productTitle: p.title,
      productHandle: p.handle,
      productImageUrl: p.images[0]?.originalSrc ?? "",
      productPrice: String(p.variants[0]?.price ?? ""),
      variantId: (String(p.variants[0]?.id ?? "")).split("/").pop() ?? "",
      sortOrder: i,
    }));

    onChange(products);
  }

  function remove(productId: string) {
    onChange(
      selectedProducts
        .filter((p) => p.productId !== productId)
        .map((p, i) => ({ ...p, sortOrder: i })),
    );
  }

  return (
    <div>
      <s-button onClick={openPicker}>
        {selectedProducts.length > 0 ? "Edit selected products" : "Select products"}
      </s-button>

      {selectedProducts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <s-table>
            <s-table-header-row>
              <s-table-header>Image</s-table-header>
              <s-table-header>Product</s-table-header>
              <s-table-header>Price</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {selectedProducts.map((p) => (
                <s-table-row key={p.productId}>
                  <s-table-cell>
                    {p.productImageUrl ? (
                      <s-thumbnail
                        src={p.productImageUrl}
                        alt={p.productTitle}
                        size="small"
                      />
                    ) : null}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{p.productTitle}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{p.productPrice ? `$${p.productPrice}` : "—"}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-button variant="tertiary" onClick={() => remove(p.productId)}>
                      Remove
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </div>
      )}
    </div>
  );
}

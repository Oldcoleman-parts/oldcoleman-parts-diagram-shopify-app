import { useAppBridge } from "@shopify/app-bridge-react";
import type { Product } from "@shopify/app-bridge-types";
import { type ReactNode, useState } from "react";

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
      action: "save" as "add",
      selectionIds,
    });

    if (!result) return; // user cancelled

    const products: SelectedProduct[] = (result as Product[]).map((p, i) => ({
      productId: p.id.split("/").pop() ?? p.id,
      productTitle: p.title,
      productHandle: p.handle,
      productImageUrl: p.images[0]?.originalSrc ?? "",
      productPrice: String(p.variants[0]?.price ?? ""),
      variantId:
        String(p.variants[0]?.id ?? "")
          .split("/")
          .pop() ?? "",
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

  function TrashIcon() {
    return (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a1 1 0 0 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM7 8a1 1 0 0 1 2 0v6a1 1 0 0 1-2 0V8zm5-1a1 1 0 0 0-1 1v6a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1z"
        />
      </svg>
    );
  }

  function IconBtn({
    onClick,
    title,
    color = "#6b7280",
    children,
  }: {
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

  return (
    <div>
      {/* Header row: label left, button right */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: selectedProducts.length > 0 ? "4px" : "10px",
      }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#202223" }}>
          Products (parts)
        </span>
        {selectedProducts.length > 0 && (
          <s-button onClick={openPicker} variant="primary">Add more products</s-button>
        )}
      </div>

      {selectedProducts.length === 0 && (
        <s-button onClick={openPicker}>Select products</s-button>
      )}

      {selectedProducts.length > 0 && (
        <div>
          <s-table>
            <s-table-header-row>
              <s-table-header>Image</s-table-header>
              <s-table-header>Product</s-table-header>
              <s-table-header>Price</s-table-header>
              <s-table-header>Action</s-table-header>
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
                    <s-text>
                      {p.productPrice ? `$${p.productPrice}` : "—"}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <IconBtn
                      title="Remove"
                      color="#f0877a"
                      onClick={() => remove(p.productId)}
                    >
                      <TrashIcon />
                    </IconBtn>
                    {/* <s-button variant="tertiary" onClick={() => remove(p.productId)}>
                      Remove
                    </s-button> */}
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

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const [diagramCount, categoryCount] = await Promise.all([
    db.diagram.count(),
    db.category.count(),
  ]);

  return { diagramCount, categoryCount };
};

export default function Index() {
  const { diagramCount, categoryCount } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <s-page heading="Dashboard">
      <s-section heading="Overview">
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => navigate("/app/diagrams")}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
          >
            <div style={{
              background: "linear-gradient(135deg, #2c6ecb 0%, #1a4fa0 100%)",
              borderRadius: "12px",
              padding: "20px 28px",
              minWidth: "160px",
              color: "#fff",
              boxShadow: "0 2px 8px rgba(44,110,203,0.3)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 500, opacity: 0.85, marginBottom: "8px", letterSpacing: "0.03em", textTransform: "uppercase" }}>Diagrams</div>
              <div style={{ fontSize: "36px", fontWeight: 700, lineHeight: 1 }}>{diagramCount}</div>
              <div style={{ fontSize: "12px", marginTop: "8px", opacity: 0.75 }}>View all →</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/categories")}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
          >
            <div style={{
              background: "linear-gradient(135deg, #1a7f5a 0%, #0f5c40 100%)",
              borderRadius: "12px",
              padding: "20px 28px",
              minWidth: "160px",
              color: "#fff",
              boxShadow: "0 2px 8px rgba(26,127,90,0.3)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 500, opacity: 0.85, marginBottom: "8px", letterSpacing: "0.03em", textTransform: "uppercase" }}>Categories</div>
              <div style={{ fontSize: "36px", fontWeight: 700, lineHeight: 1 }}>{categoryCount}</div>
              <div style={{ fontSize: "12px", marginTop: "8px", opacity: 0.75 }}>Manage →</div>
            </div>
          </button>
        </div>
      </s-section>

      <s-section heading="Quick actions">
        <s-paragraph>
          Start by creating categories to organize your parts diagrams, then
          create diagrams and link Shopify products to them.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" href="/app/diagrams/new">Create diagram</s-button>
          <s-button href="/app/categories" variant="secondary">
            Manage categories
          </s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="About this app">
        <s-paragraph>
          <s-text>Diagram App</s-text> lets you manage parts breakdowns for
          product models and link Shopify products to them.
        </s-paragraph>
        <s-paragraph>
          Customers visit an interactive storefront page where they can identify
          parts visually and add them directly to their cart.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>Create categories to organize your diagrams</s-list-item>
          <s-list-item>Upload a diagram image and optional PDF for each model</s-list-item>
          <s-list-item>Link Shopify products (parts) to the diagram</s-list-item>
          <s-list-item>
            Customers browse parts at yourstore.myshopify.com/apps/diagram/handle
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

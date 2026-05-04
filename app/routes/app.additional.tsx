export default function GettingStarted() {
  return (
    <s-page heading="Getting started">
      <s-section heading="Step 1 — Create categories">
        <s-paragraph>
          Categories organize your parts diagrams into logical groups (e.g.
          "Lanterns", "Stoves", "Heaters"). Each category can have a parent
          category for a two-level hierarchy.
        </s-paragraph>
        <s-button href="/app/categories">Go to Categories</s-button>
      </s-section>

      <s-section heading="Step 2 — Create a diagram">
        <s-paragraph>
          A diagram represents one product model's parts breakdown. Give it a
          title, upload a diagram image (and optionally a PDF), assign it to a
          category, and pick the Shopify products that are parts for that model.
        </s-paragraph>
        <s-button href="/app/diagrams/new">Create a diagram</s-button>
      </s-section>

      <s-section heading="Step 3 — Share the storefront page">
        <s-paragraph>
          Every diagram gets a unique URL on your storefront via the App Proxy.
          Customers see the diagram image, a scrollable parts gallery, and a
          parts table with Add to Cart buttons — all styled inside your store's
          theme.
        </s-paragraph>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <pre style={{ margin: 0 }}>
            <code>yourstore.myshopify.com/apps/diagram/{"<handle>"}</code>
          </pre>
        </s-box>
      </s-section>

      <s-section slot="aside" heading="Storefront page layout">
        <s-unordered-list>
          <s-list-item>Full-width diagram image with caption</s-list-item>
          <s-list-item>Horizontal scrollable parts gallery</s-list-item>
          <s-list-item>
            Parts table: #, Part No., Description, Price, Add to Cart
          </s-list-item>
          <s-list-item>
            Clicking a gallery card highlights the matching table row
          </s-list-item>
          <s-list-item>
            If no products are linked, shows a PDF download link instead
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Tech stack">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router v7
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma + SQLite
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>UI: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/app-home/using-polaris-components"
            target="_blank"
          >
            Polaris web components
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>File storage: </s-text>
          <s-link href="https://shopify.dev/docs/api/admin-graphql/latest/mutations/stagedUploadsCreate" target="_blank">
            Shopify CDN (staged uploads)
          </s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

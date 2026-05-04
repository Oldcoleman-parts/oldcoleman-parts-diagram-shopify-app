import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const esc = (s: string | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";

  const [categories, diagrams] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.diagram.findMany({
      where: search
        ? { title: { contains: search, mode: "insensitive" } }
        : undefined,
      include: {
        category: true,
        _count: { select: { products: true } },
      },
      orderBy: { title: "asc" },
    }),
  ]);

  // Group diagrams by category id (null = uncategorised)
  type DiagramRow = (typeof diagrams)[number];
  const byCategory: Record<string, DiagramRow[]> = {};
  const uncategorised: DiagramRow[] = [];

  for (const d of diagrams) {
    if (d.categoryId !== null) {
      const key = String(d.categoryId);
      (byCategory[key] ??= []).push(d);
    } else {
      uncategorised.push(d);
    }
  }

  // Build ordered sections: named categories first, uncategorised last
  type Section = { id: string | null; name: string; items: DiagramRow[] };
  const sections: Section[] = [];

  for (const cat of categories) {
    const items = byCategory[String(cat.id)] ?? [];
    if (items.length > 0 || !search) {
      sections.push({ id: String(cat.id), name: cat.name, items });
    }
  }

  if (uncategorised.length > 0) {
    sections.push({ id: null, name: "Other", items: uncategorised });
  }

  const totalDiagrams = diagrams.length;

  // Relative base path so links work through the Shopify proxy
  // The proxy forwards /apps/diagram/* → /proxy/diagram/*
  // On the storefront side the handle page is at /apps/diagram/:handle
  // We use a relative URL so it works on any store domain.
  const proxyBase = "/apps/diagram";

  const diagramCards = (items: DiagramRow[]) =>
    items
      .map(
        (d) => `
      <a class="diagram-card" href="${esc(proxyBase)}/${esc(d.handle)}">
        <div class="card-img-wrap">
          ${
            d.imageUrl
              ? `<img src="${esc(d.imageUrl)}" alt="${esc(d.title)}" />`
              : `<div class="card-img-placeholder"></div>`
          }
        </div>
        <div class="card-body">
          <span class="card-title">${esc(d.title)}</span>
          <span class="card-meta">${d._count.products > 0 ? `${d._count.products} part${d._count.products !== 1 ? "s" : ""}` : d.fileUrl ? "PDF available" : "No parts"}</span>
        </div>
      </a>`,
      )
      .join("");

  const sectionHtml = sections
    .map(
      (s) => `
    <section class="category-section">
      <h2 class="category-heading">${esc(s.name)}</h2>
      <div class="diagram-grid">
        ${s.items.length > 0 ? diagramCards(s.items) : `<p class="empty-note">No diagrams in this category yet.</p>`}
      </div>
    </section>`,
    )
    .join("");

  const html = `
<div class="diagram-listing">
  <style>
    .diagram-listing { max-width: 1100px; margin: 0 auto; padding: 24px 16px; font-family: inherit; }
    .listing-header { margin-bottom: 28px; }
    .listing-header h1 { font-size: 1.75rem; font-weight: 700; color: #202223; margin: 0 0 6px; }
    .listing-header p { color: #6d7175; margin: 0; }
    .search-row { display: flex; gap: 12px; margin-bottom: 32px; }
    .search-row form { flex: 1; display: flex; gap: 8px; max-width: 480px; }
    .search-row input[type="text"] { flex: 1; padding: 9px 12px; border: 1px solid #babec3; border-radius: 6px; font-size: 0.95rem; outline: none; }
    .search-row input[type="text"]:focus { border-color: #008060; box-shadow: 0 0 0 2px rgba(0,128,96,0.2); }
    .search-row button { padding: 9px 18px; background: #008060; color: #fff; border: none; border-radius: 6px; font-size: 0.9rem; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .search-row button:hover { background: #006e52; }
    .category-section { margin-bottom: 40px; }
    .category-heading { font-size: 1.15rem; font-weight: 600; color: #202223; border-bottom: 2px solid #e1e3e5; padding-bottom: 8px; margin: 0 0 16px; }
    .diagram-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
    .diagram-card { display: flex; flex-direction: column; border: 1px solid #e1e3e5; border-radius: 8px; overflow: hidden; text-decoration: none; color: inherit; transition: box-shadow 0.15s, border-color 0.15s; background: #fff; }
    .diagram-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-color: #008060; }
    .card-img-wrap { aspect-ratio: 4/3; overflow: hidden; background: #f6f6f7; }
    .card-img-wrap img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .card-img-placeholder { width: 100%; height: 100%; background: #f6f6f7; }
    .card-body { padding: 12px; flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .card-title { font-weight: 600; font-size: 0.9rem; color: #202223; line-height: 1.3; }
    .card-meta { font-size: 0.78rem; color: #6d7175; }
    .empty-note { color: #6d7175; font-size: 0.9rem; font-style: italic; }
    .no-results { text-align: center; padding: 48px 0; color: #6d7175; }
    .no-results h2 { font-size: 1.1rem; margin: 0 0 8px; }
    .clear-search { display: inline-block; margin-top: 12px; color: #008060; text-decoration: none; font-weight: 500; }
    @media (max-width: 600px) { .diagram-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; } }
  </style>

  <div class="listing-header">
    <h1>Parts Diagrams</h1>
    <p>Browse parts breakdowns by model. Click a diagram to view the interactive parts list.</p>
  </div>

  <div class="search-row">
    <form method="GET" action="${esc(proxyBase)}">
      <input
        type="text"
        name="q"
        value="${esc(search)}"
        placeholder="Search diagrams…"
        aria-label="Search diagrams"
      />
      <button type="submit">Search</button>
    </form>
    ${search ? `<a class="clear-search" href="${esc(proxyBase)}" style="align-self:center;color:#008060;text-decoration:none;font-weight:500;font-size:0.9rem;">✕ Clear</a>` : ""}
  </div>

  ${
    totalDiagrams === 0
      ? `<div class="no-results">
          <h2>${search ? `No diagrams found for "${esc(search)}"` : "No diagrams available yet."}</h2>
          ${search ? `<p>Try a different search term.</p><a class="clear-search" href="${esc(proxyBase)}">View all diagrams</a>` : ""}
        </div>`
      : sectionHtml
  }
</div>
`;

  return new Response(html, {
    headers: { "Content-Type": "application/liquid" },
  });
};

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

type CatFlat = { id: number; name: string; parentId: number | null };
type CatNode = CatFlat & { children: CatNode[] };

function buildCatTree(cats: CatFlat[]) {
  const map = new Map<number, CatNode>();
  for (const c of cats) map.set(c.id, { ...c, children: [] });
  const roots: CatNode[] = [];
  for (const [, node] of map) {
    if (!node.parentId || !map.has(node.parentId)) roots.push(node);
    else map.get(node.parentId)!.children.push(node);
  }
  function sort(ns: CatNode[]) {
    ns.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of ns) sort(n.children);
  }
  sort(roots);
  return { map, roots };
}

function getRoot(catId: number, map: Map<number, CatNode>): CatNode | undefined {
  let cur = map.get(catId);
  while (cur?.parentId && map.has(cur.parentId)) cur = map.get(cur.parentId);
  return cur;
}

function getDescendantIds(nodeId: number, map: Map<number, CatNode>): number[] {
  const ids: number[] = [];
  const queue = [nodeId];
  while (queue.length) {
    const id = queue.shift()!;
    ids.push(id);
    for (const child of map.get(id)?.children ?? []) queue.push(child.id);
  }
  return ids;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const search     = url.searchParams.get("q")?.trim() ?? "";
  const catFilters = (url.searchParams.get("cats") ?? "")
    .split(",").map(Number).filter((n) => n > 0);
  const serFilters = (url.searchParams.get("series") ?? "")
    .split(",").map(Number).filter((n) => n > 0);

  const allCategories = await db.category.findMany({ orderBy: { name: "asc" } });
  const { map: catMap, roots } = buildCatTree(allCategories);

  // Which category IDs to restrict to for the main query.
  // When series are selected alongside multiple root categories, include diagrams
  // from every selected series PLUS all diagrams from categories that contain none
  // of the selected series (so other selected categories stay fully visible).
  const filterIds: number[] | null = serFilters.length > 0
    ? [
        ...serFilters.flatMap((sid) => getDescendantIds(sid, catMap)),
        ...catFilters
          .filter((id) => {
            const desc = getDescendantIds(id, catMap);
            return !serFilters.some((sid) => desc.includes(sid));
          })
          .flatMap((id) => getDescendantIds(id, catMap)),
      ]
    : catFilters.length > 0
      ? catFilters.flatMap((id) => getDescendantIds(id, catMap))
      : null;

  const searchWhere = search ? { title: { contains: search, mode: "insensitive" as const } } : {};

  // Count query (search-only, no category filter) — used for tab badges
  const forCounts = await db.diagram.findMany({
    where: searchWhere,
    select: { id: true, categories: { select: { categoryId: true } } },
  });

  const rootCounts = new Map<number, number>();
  for (const d of forCounts) {
    const seen = new Set<number>();
    for (const dc of d.categories) {
      const root = getRoot(dc.categoryId, catMap);
      if (root && !seen.has(root.id)) {
        seen.add(root.id);
        rootCounts.set(root.id, (rootCounts.get(root.id) ?? 0) + 1);
      }
    }
  }
  const totalCount = forCounts.length;

  // Main display query
  const diagrams = await db.diagram.findMany({
    where: {
      ...searchWhere,
      ...(filterIds ? { categories: { some: { categoryId: { in: filterIds } } } } : {}),
    },
    include: {
      categories: {
        include: { category: { select: { id: true, name: true, parentId: true } } },
      },
      _count: { select: { products: true } },
    },
    orderBy: { title: "asc" },
  });

  const base = "/apps/diagram";

  function qp(params: { cats?: number[]; series?: number[]; q?: string }) {
    const p = new URLSearchParams();
    const q = "q" in params ? params.q : search;
    if (q) p.set("q", q);
    const cats = "cats" in params ? params.cats : catFilters;
    if (cats && cats.length > 0) p.set("cats", cats.join(","));
    const series = "series" in params ? params.series : serFilters;
    if (series && series.length > 0) p.set("series", series.join(","));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  }

  function getBadge(cats: Array<{ categoryId: number; category: CatFlat }>): string {
    if (!cats.length) return "";
    const root = getRoot(cats[0].categoryId, catMap);
    return root?.name ?? cats[0].category.name;
  }

  /* ── icons ───────────────────────────────────────────────────── */
  const icoSearch = `<svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="18" y2="18"/></svg>`;
  const icoDoc    = `<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7z"/></svg>`;

  /* ── card HTML ───────────────────────────────────────────────── */
  function cardHtml(d: (typeof diagrams)[number]) {
    const badge = getBadge(d.categories);
    const parts = d._count.products;
    const href  = `${base}/${esc(d.handle)}`;
    const imgHtml = d.imageUrl
      ? `<img src="${esc(d.imageUrl)}" alt="${esc(d.title)}" loading="lazy" />`
      : `<div class="card-no-img">${icoDoc}</div>`;

    return `
<a class="dg-card" href="${href}">
  <div class="dg-card-img">
    ${imgHtml}
    ${badge ? `<span class="dg-badge">${esc(badge)}</span>` : ""}
  </div>
  <div class="dg-card-body">
    <div class="dg-card-title">${esc(d.title)}</div>
    ${d.description ? `<div class="dg-card-desc">${esc(d.description)}</div>` : ""}
    <div class="dg-card-foot">
      <span class="dg-parts">${icoDoc} ${parts > 0 ? `${parts} part${parts !== 1 ? "s" : ""}` : d.fileUrl ? "PDF" : "No parts"}</span>
      <span class="dg-view">View Diagram &rsaquo;</span>
    </div>
  </div>
</a>`;
  }

  const filteredCount = diagrams.length;

  const activeFilterCount = catFilters.length + serFilters.length;
  const icoFilterSliders = `<svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm3 5a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm2 5a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1z"/></svg>`;
  const icoFolderAmber = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b"><path d="M3 7a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293L11.707 6.7A1 1 0 0 0 12.414 7H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`;
  const icoFolderSlate = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#94a3b8"><path d="M3 7a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293L11.707 6.7A1 1 0 0 0 12.414 7H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`;
  const icoChevRight = `<svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"/></svg>`;

  const catTreeHtml = roots.map((r) => {
    const isSelected = catFilters.includes(r.id);
    const showChildren = isSelected && r.children.length > 0;
    const count = rootCounts.get(r.id) ?? 0;
    const rChildIds = new Set(r.children.map((c) => c.id));
    const toggleHref = isSelected
      ? qp({ cats: catFilters.filter((id) => id !== r.id), series: serFilters.filter((sid) => !rChildIds.has(sid)) })
      : qp({ cats: [...catFilters, r.id] });
    const childrenHtml = showChildren ? `
      <div class="dgl-chk-children is-open">
        ${r.children.map((s) => {
          const serSelected = serFilters.includes(s.id);
          const serHref = serSelected
            ? qp({ series: serFilters.filter((sid) => sid !== s.id) })
            : qp({ series: [...serFilters, s.id] });
          return `
        <a class="dgl-chk-row${serSelected ? " is-checked" : ""}" href="${esc(serHref)}">
          <span class="dgl-chk-spacer"></span>
          <input class="dgl-chk-input" type="checkbox"${serSelected ? " checked" : ""} readonly />
          ${icoFolderSlate}
          <span class="dgl-chk-label">${esc(s.name)}</span>
        </a>`;
        }).join("")}
      </div>` : "";
    return `
    <div class="dgl-chk-item">
      <a class="dgl-chk-row${isSelected ? " is-checked" : ""}" href="${esc(toggleHref)}">
        ${showChildren ? `<button class="dgl-chk-toggle js-chk-toggle is-open" type="button">${icoChevRight}</button>` : `<span class="dgl-chk-spacer"></span>`}
        <input class="dgl-chk-input" type="checkbox"${isSelected ? " checked" : ""} readonly />
        ${icoFolderAmber}
        <span class="dgl-chk-label">${esc(r.name)}</span>
        ${!isSelected ? `<span class="dgl-chk-count">${count}</span>` : ""}
      </a>
      ${childrenHtml}
    </div>`;
  }).join("");

  const html = `
<div class="dgl">
<style>
  .dgl *,.dgl *::before,.dgl *::after{box-sizing:border-box}
  .dgl{width:100%;max-width:1260px;margin:0 auto;padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827}

  /* header */
  .dgl-hero{margin-bottom:22px}
  .dgl-hero h1{font-size:1.75rem;font-weight:800;color:#111827;margin:0 0 6px}
  .dgl-hero p{color:#6b7280;margin:0;font-size:0.95rem;max-width:580px;line-height:1.5}

  /* search card */
  .dgl-search-card{background:#fff;border:1px solid #e2e0da;border-radius:10px;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
  .dgl-search-row{padding:14px 18px;display:flex;align-items:center;gap:10px}
  .dgl-search-input-wrap{flex:1;display:flex;align-items:center;gap:10px;background:#fafaf9;border:1.5px solid #e2e0da;border-radius:8px;padding:9px 14px;transition:border-color 0.15s,box-shadow 0.15s}
  .dgl-search-input-wrap:focus-within{border-color:#1d4ed8;background:#fff;box-shadow:0 0 0 3px rgba(29,78,216,0.08)}
  .dgl-search-input-wrap input{flex:1;border:none;background:none;font-size:0.9rem;color:#111827;outline:none}
  .dgl-search-input-wrap input::placeholder{color:#9ca3af}
  .dgl-search-btn{background:#1d4ed8;color:#fff;border:none;border-radius:7px;padding:9px 20px;font-size:0.87rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background 0.15s}
  .dgl-search-btn:hover{background:#1e40af}

  /* mobile filter toggle */
  .dgl-filter-toggle{display:none;align-items:center;gap:8px;padding:9px 16px;border:1.5px solid #e2e0da;border-radius:7px;background:#fff;font-size:0.87rem;font-weight:600;color:#374151;cursor:pointer;margin-bottom:16px;font-family:inherit;transition:border-color 0.15s}
  .dgl-filter-toggle:hover{border-color:#1d4ed8;color:#1d4ed8}
  .dgl-filter-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;background:#1d4ed8;color:#fff;border-radius:10px;font-size:0.7rem;font-weight:700;padding:0 5px}

  /* two-column layout */
  .dgl-layout{display:grid;grid-template-columns:220px 1fr;gap:24px;align-items:start}

  /* loading spinner */
  .dgl-spinner{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:80px 0;color:#9ca3af;font-size:0.88rem}
  .dgl-spinner-ring{width:38px;height:38px;border:3px solid #e2e0da;border-top-color:#1d4ed8;border-radius:50%;animation:dgl-spin 0.65s linear infinite}
  @keyframes dgl-spin{to{transform:rotate(360deg)}}

  /* sidebar */
  .dgl-sidebar{background:#fff;border:1px solid #e2e0da;border-radius:10px;overflow:hidden;position:sticky;top:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
  .dgl-sidebar-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid #f0ede8;background:#fafaf9}
  .dgl-sidebar-title{font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.07em;margin:0}
  .dgl-clear-all{font-size:0.78rem;color:#1d4ed8;font-weight:600;text-decoration:none}
  .dgl-clear-all:hover{text-decoration:underline}
  .dgl-filter-group{padding:14px 16px}
  .dgl-filter-group+.dgl-filter-group{border-top:1px solid #f0ede8}
  .dgl-filter-group-title{font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;margin:0 0 10px}
  /* checkbox tree filter */
  .dgl-chk-list{display:flex;flex-direction:column;gap:1px}
  .dgl-chk-row{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:6px;cursor:pointer;user-select:none;transition:background 0.1s;text-decoration:none;color:inherit}
  .dgl-chk-row:hover{background:#f9f7f4}
  .dgl-chk-row.is-checked{background:#eff6ff}
  .dgl-chk-toggle{width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:0;color:#c4bcb0;line-height:1;transition:color 0.1s}
  .dgl-chk-toggle:hover{color:#6b7280}
  .dgl-chk-toggle svg{transition:transform 0.15s}
  .dgl-chk-toggle.is-open svg{transform:rotate(90deg)}
  .dgl-chk-spacer{width:16px;height:16px;flex-shrink:0;display:inline-block}
  .dgl-chk-input{width:14px;height:14px;flex-shrink:0;accent-color:#1d4ed8;pointer-events:none;cursor:pointer}
  .dgl-chk-label{font-size:0.86rem;color:#374151;flex:1;line-height:1.35}
  .dgl-chk-row.is-checked .dgl-chk-label{color:#1d4ed8;font-weight:600}
  .dgl-chk-count{font-size:0.7rem;background:#f0ede8;color:#6b7280;padding:2px 6px;border-radius:8px;flex-shrink:0;font-weight:600;line-height:1.3}
  .dgl-chk-row.is-checked .dgl-chk-count{background:#dbeafe;color:#1d4ed8}
  .dgl-chk-children{padding-left:22px;display:none}
  .dgl-chk-children.is-open{display:block}
  .dgl-chk-children .dgl-chk-label{font-size:0.83rem}

  /* results meta */
  .dgl-meta{font-size:0.85rem;color:#6b7280;margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .dgl-meta strong{color:#111827;font-weight:600}
  .dgl-meta-clear{font-size:0.8rem;color:#6b7280;text-decoration:none;display:inline-flex;align-items:center;gap:3px}
  .dgl-meta-clear:hover{color:#1d4ed8}

  /* grid */
  .dgl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}

  /* card */
  .dg-card{display:flex;flex-direction:column;background:#fff;border:1px solid #e2e0da;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;transition:box-shadow 0.15s,transform 0.15s,border-color 0.15s}
  .dg-card:hover{box-shadow:0 8px 24px rgba(0,0,0,0.1);transform:translateY(-2px);border-color:#c4bcb0}
  .dg-card-img{position:relative;aspect-ratio:4/3;background:#f8f9fa;overflow:hidden}
  .dg-card-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.2s}
  .dg-card:hover .dg-card-img img{transform:scale(1.04)}
  .card-no-img{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#f3f4f6,#e9ebee)}
  .card-no-img svg{width:40px;height:40px;fill:#c4ccd5}
  .dg-badge{position:absolute;top:10px;right:10px;background:rgba(17,24,39,0.72);backdrop-filter:blur(4px);color:#fff;font-size:0.6rem;font-weight:700;letter-spacing:0.06em;padding:3px 9px;border-radius:5px;text-transform:uppercase}
  .dg-card-body{padding:14px 16px 12px;display:flex;flex-direction:column;flex:1}
  .dg-card-title{font-size:0.95rem;font-weight:700;color:#1d4ed8;margin-bottom:3px;line-height:1.3}
  .dg-card-desc{font-size:0.8rem;color:#4b5563;line-height:1.4;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .dg-card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:10px;border-top:1px solid #f0ede8}
  .dg-parts{display:flex;align-items:center;gap:5px;font-size:0.77rem;color:#6b7280}
  .dg-view{font-size:0.8rem;font-weight:600;color:#1d4ed8}
  .dg-card:hover .dg-view{text-decoration:underline}

  /* empty */
  .dgl-empty{text-align:center;padding:64px 0;color:#6b7280}
  .dgl-empty h3{font-size:1.1rem;color:#374151;margin:0 0 8px;font-weight:600}
  .dgl-empty p{margin:0 0 14px;font-size:0.9rem}
  .dgl-empty a{color:#1d4ed8;font-weight:600;text-decoration:none}

  @media(max-width:860px){
    .dgl-layout{grid-template-columns:190px 1fr}
  }
  @media(max-width:680px){
    .dgl{padding:20px 14px}
    .dgl-hero h1{font-size:1.4rem}
    .dgl-layout{grid-template-columns:1fr}
    .dgl-sidebar{position:static;display:none}
    .dgl-sidebar.is-open{display:block}
    .dgl-filter-toggle{display:inline-flex}
    .dgl-grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:13px}
  }
</style>

<div class="dgl-hero">
  <h1>Parts Diagram Library</h1>
  <p>Browse all available diagrams. Select a diagram to view the exploded parts list and order components.</p>
</div>


<!-- Search bar — stays at the top -->
<div class="dgl-search-card">
  <form class="dgl-search-row js-dgl-search-form" method="GET" action="${esc(base)}">
    ${catFilters.length > 0 ? `<input type="hidden" name="cats" value="${catFilters.join(",")}" />` : ""}
    ${serFilters.length > 0 ? `<input type="hidden" name="series" value="${serFilters.join(",")}" />` : ""}
    <div class="dgl-search-input-wrap">
      ${icoSearch}
      <input
        type="text"
        name="q"
        value="${esc(search)}"
        placeholder="Search by model number, name, or keywords..."
        autocomplete="off"
      />
    </div>
    <button class="dgl-search-btn" type="submit">Search</button>
  </form>
</div>

<!-- Mobile: show/hide sidebar toggle -->
<button class="dgl-filter-toggle js-dgl-filter-toggle" type="button">
  ${icoFilterSliders}
  Filters
  ${activeFilterCount > 0 ? `<span class="dgl-filter-badge">${activeFilterCount}</span>` : ""}
</button>

<div class="dgl-layout js-dgl-layout">

  <!-- LEFT: filter sidebar -->
  <aside class="dgl-sidebar js-dgl-sidebar">
    <div class="dgl-sidebar-head">
      <span class="dgl-sidebar-title">Filters</span>
      ${(catFilters.length > 0 || serFilters.length > 0 || search) ? `<a href="${esc(base)}" class="dgl-clear-all">Clear all</a>` : ""}
    </div>

    <!-- Category filter -->
    <div class="dgl-filter-group">
      <p class="dgl-filter-group-title">Category</p>
      <div class="dgl-chk-list">
        <a class="dgl-chk-row${catFilters.length === 0 ? " is-checked" : ""}" href="${esc(qp({ cats: [], series: [] }))}">
          <span class="dgl-chk-spacer"></span>
          <input class="dgl-chk-input" type="checkbox"${catFilters.length === 0 ? " checked" : ""} readonly />
          <span class="dgl-chk-label">All</span>
          <span class="dgl-chk-count">${totalCount}</span>
        </a>
        ${catTreeHtml}
      </div>
    </div>
  </aside>

  <!-- RIGHT: results -->
  <div class="dgl-content">
    <p class="dgl-meta">
      Showing <strong>${filteredCount}</strong>${filteredCount !== totalCount ? ` of <strong>${totalCount}</strong>` : ""} diagram${totalCount !== 1 ? "s" : ""}
      ${search ? `<a href="${esc(qp({ q: "" }))}" class="dgl-meta-clear">&#x2715; Clear &ldquo;${esc(search)}&rdquo;</a>` : ""}
    </p>

    ${filteredCount === 0 ? `
    <div class="dgl-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" style="margin-bottom:12px"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <h3>${search ? `No diagrams found for &ldquo;${esc(search)}&rdquo;` : "No diagrams available yet."}</h3>
      <p>${search ? "Try a different search term or clear the filters." : "Check back soon."}</p>
      ${search || catFilters.length > 0 ? `<a href="${esc(base)}">View all diagrams</a>` : ""}
    </div>
    ` : `
    <div class="dgl-grid">
      ${diagrams.map(cardHtml).join("")}
    </div>
    `}
  </div>

</div>

<script>
(function() {
  var APP_BASE = '${base}';

  /* ── AJAX navigation ────────────────────────────────────────────
     Swaps only the sidebar + content area (js-dgl-layout) and updates
     the search form's hidden inputs so subsequent searches stay in sync.
     Falls back to a full page load if anything goes wrong.             */
  function navigate(url, pushState) {
    var layout = document.querySelector('.js-dgl-layout');
    if (!layout) { window.location.href = url; return; }

    /* show spinner in the content area; sidebar stays fully visible */
    var content = layout.querySelector('.dgl-content');
    if (content) content.innerHTML = '<div class="dgl-spinner"><div class="dgl-spinner-ring"></div>Loading&hellip;</div>';

    fetch(url, { headers: { Accept: 'text/html' } })
      .then(function(r) { if (!r.ok) throw r; return r.text(); })
      .then(function(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');

        /* swap sidebar + grid in one shot */
        var newLayout = doc.querySelector('.js-dgl-layout');
        if (!newLayout) throw new Error('missing layout');
        document.querySelector('.js-dgl-layout').replaceWith(newLayout);

        /* keep the search form's hidden inputs in sync so the next
           search still carries the newly selected category/series     */
        var newForm = doc.querySelector('.js-dgl-search-form');
        var curForm = document.querySelector('.js-dgl-search-form');
        if (newForm && curForm) {
          curForm.querySelectorAll('input[type="hidden"]').forEach(function(el) { el.remove(); });
          newForm.querySelectorAll('input[type="hidden"]').forEach(function(el) {
            curForm.prepend(el.cloneNode(true));
          });
          /* also mirror the mobile filter badge count on the toggle button */
          var newBadge = doc.querySelector('.js-dgl-filter-toggle');
          var curBadge = document.querySelector('.js-dgl-filter-toggle');
          if (newBadge && curBadge) curBadge.innerHTML = newBadge.innerHTML;
        }

        if (pushState !== false) history.pushState(null, '', url);
        bindToggle();
      })
      .catch(function() { window.location.href = url; });
  }

  /* ── Mobile sidebar toggle ────────────────────────────────────── */
  function bindToggle() {
    var toggle  = document.querySelector('.js-dgl-filter-toggle');
    var sidebar = document.querySelector('.js-dgl-sidebar');
    if (toggle && sidebar) {
      toggle.onclick = function() {
        var open = sidebar.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      };
    }
  }

  /* ── Global click handler: chevron toggle + AJAX link interception ── */
  document.querySelector('.dgl').addEventListener('click', function(e) {
    /* Chevron expand/collapse — must check before link interception */
    var toggle = e.target.closest('.js-chk-toggle');
    if (toggle) {
      e.preventDefault();
      var item = toggle.closest('.dgl-chk-item');
      var children = item && item.querySelector('.dgl-chk-children');
      if (children) {
        var open = children.classList.toggle('is-open');
        toggle.classList.toggle('is-open', open);
      }
      return;
    }

    /* AJAX navigation for filter/clear links (skip diagram card links) */
    var link = e.target.closest('a');
    if (!link || link.closest('.dg-card')) return;
    var href = link.getAttribute('href') || '';
    if (!href.startsWith(APP_BASE) && !href.startsWith('?')) return;
    e.preventDefault();
    navigate(link.href);
  });

  /* ── Search form submit ───────────────────────────────────────── */
  var form = document.querySelector('.js-dgl-search-form');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var fd = new FormData(form);
      var p  = new URLSearchParams();
      fd.forEach(function(v, k) { if (v) p.set(k, String(v)); });
      navigate(APP_BASE + (p.toString() ? '?' + p.toString() : ''));
    });
  }

  /* ── Browser back / forward ───────────────────────────────────── */
  window.addEventListener('popstate', function() {
    navigate(window.location.href, false);
  });

  bindToggle();
})();
</script>

</div>
`;

  return new Response(html, {
    headers: { "Content-Type": "application/liquid" },
  });
};

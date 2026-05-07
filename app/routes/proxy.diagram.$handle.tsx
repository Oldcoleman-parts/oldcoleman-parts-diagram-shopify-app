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

function getRootName(cats: Array<{ categoryId: number; category: CatFlat }>, all: CatFlat[]): string {
  if (!cats.length) return "";
  const map = new Map(all.map((c) => [c.id, c]));
  let cur = map.get(cats[0].categoryId);
  while (cur?.parentId && map.has(cur.parentId)) cur = map.get(cur.parentId);
  return cur?.name ?? cats[0].category.name;
}

// Extracts the part number from a Shopify product handle.
// e.g. "ventilator-cap-220-5571" → "220-5571"
//      "mantle-21cp-21a5135"    → "21cp-21a5135"
//      "pump-cup"               → "pump-cup" (fallback, no digits)
function extractPartNo(handle: string): string {
  const segments = handle.split("-");
  const result: string[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/\d/.test(segments[i])) {
      result.unshift(segments[i]);
    } else {
      break;
    }
  }
  return result.length > 0 ? result.join("-") : handle;
}

const icoCart = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0"><path d="M3 1a1 1 0 0 0 0 2h1.22l.305 1.222a.997.997 0 0 0 .01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 0 0 0-2H6.414l1-1H14a1 1 0 0 0 .894-.553l3-6A1 1 0 0 0 17 3H6.28l-.31-1.243A1 1 0 0 0 5 1H3zM16 16.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM6.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`;
const icoChevR = `<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"/></svg>`;
const icoInfo  = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0"><path fill-rule="evenodd" clip-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1 9a1 1 0 0 1-1-1V9a1 1 0 1 1 2 0v5a1 1 0 0 1-1 1z"/></svg>`;
const icoCheck = `<svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z"/></svg>`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const allCategories = await db.category.findMany({ orderBy: { name: "asc" } });

  const diagram = await db.diagram.findUnique({
    where: { handle: params.handle },
    include: {
      products: { orderBy: { sortOrder: "asc" } },
      categories: {
        include: { category: { select: { id: true, name: true, parentId: true } } },
      },
    },
  });

  if (!diagram) {
    return new Response("<p>Diagram not found.</p>", {
      status: 404,
      headers: { "Content-Type": "application/liquid" },
    });
  }

  const categoryIds = diagram.categories.map((dc) => dc.categoryId);

  const relatedDiagrams = categoryIds.length > 0
    ? await db.diagram.findMany({
        where: { id: { not: diagram.id }, categories: { some: { categoryId: { in: categoryIds } } } },
        select: { id: true, title: true, handle: true },
        take: 8,
        orderBy: { title: "asc" },
      })
    : [];

  const base      = "/apps/diagram";
  const hasProds  = diagram.products.length > 0;
  const catBadge  = getRootName(diagram.categories, allCategories);
  const partCount = diagram.products.length;
  const PAGE_SIZE = 10;

  /* ─── thumbnail gallery ─────────────────────────────────────── */
  const galleryItems = diagram.products.map((p) => `
    <div class="dp-thumb" data-product-id="${esc(p.productId)}" data-img="${esc(p.productImageUrl ?? "")}">
      ${p.productImageUrl
        ? `<img src="${esc(p.productImageUrl)}" alt="${esc(p.productTitle)}" loading="lazy" />`
        : `<div class="dp-thumb-blank"></div>`}
      <div class="dp-thumb-overlay"><span>${esc(extractPartNo(p.productHandle))}</span></div>
      <div class="dp-thumb-name">${esc(p.productTitle)}</div>
    </div>`).join("");

  /* ─── parts table rows ──────────────────────────────────────── */
  const partRows = diagram.products.map((p, i) => `
    <tr class="dp-row" data-index="${i}" data-img="${esc(p.productImageUrl ?? "")}" data-pid="${esc(p.productId)}">
      <td class="dp-td-num"><span class="dp-num">${i + 1}</span></td>
      <td class="dp-td-partno"><a class="dp-partno" href="/products/${esc(p.productHandle)}">${esc(extractPartNo(p.productHandle))}</a></td>
      <td class="dp-td-desc">
        <span class="dp-desc">${esc(p.productTitle)}</span>
        <span class="dp-stock">${icoCheck} In Stock</span>
      </td>
      <td class="dp-td-price">${p.productPrice ? `<span class="dp-price">$${esc(p.productPrice)}</span>` : `<span class="dp-price-na">—</span>`}</td>
      <td class="dp-td-action">
        <button class="dp-add-btn" data-variant-id="${esc(p.variantId)}" type="button">
          ${icoCart} Add
        </button>
        <a class="dp-chevbtn" href="/products/${esc(p.productHandle)}">${icoChevR}</a>
      </td>
    </tr>`).join("");

  /* ─── other diagram pills ───────────────────────────────────── */
  const otherPills = relatedDiagrams.length > 0
    ? relatedDiagrams.map((r) =>
        `<a href="${base}/${esc(r.handle)}" class="dp-pill">${esc(r.title)}</a>`
      ).join("") + `<span class="dp-other-hint">(${relatedDiagrams.length} related diagram${relatedDiagrams.length !== 1 ? "s" : ""})</span>`
    : `<span class="dp-other-hint">(More diagrams coming soon)</span>`;

  /* ─── pagination controls ───────────────────────────────────── */
  const pagerHtml = partCount > PAGE_SIZE ? `
      <div class="dp-pager">
        <button class="dp-pg-btn" id="dp-pg-prev" type="button" disabled>&#8592; Prev</button>
        <span class="dp-pg-info" id="dp-pg-info">1&ndash;${PAGE_SIZE} of ${partCount}</span>
        <button class="dp-pg-btn" id="dp-pg-next" type="button">Next &#8594;</button>
      </div>` : "";

  const html = `
<div class="dp">
<style>
  .dp *,.dp *::before,.dp *::after{box-sizing:border-box}
  .dp{max-width:1200px;margin:0 auto;padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a1a;background:#f2f0eb}

  /* page header */
  .dp-hd{margin-bottom:22px}
  .dp-hd h1{font-size:1.55rem;font-weight:800;color:#111827;margin:0 0 5px;line-height:1.25}
  .dp-hd p{font-size:0.9rem;color:#6b7280;margin:0 0 12px;line-height:1.5}
  .dp-other{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:0.83rem;color:#6b7280}
  .dp-other-label{font-weight:600;color:#374151;white-space:nowrap}
  .dp-pill{background:#1d4ed8;color:#fff;border-radius:5px;padding:3px 11px;font-size:0.78rem;font-weight:600;text-decoration:none;white-space:nowrap;transition:background 0.12s}
  .dp-pill:hover{background:#1e40af}
  .dp-other-hint{color:#9ca3af;font-size:0.8rem}

  /* two-column layout */
  .dp-body{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
  .dp-left,.dp-right{min-width:0}
  @media(max-width:768px){.dp-body{grid-template-columns:1fr}}

  /* shared card */
  .dp-card{background:#fff;border:1px solid #e2e0da;border-radius:10px;overflow:hidden}
  .dp-card-hd{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid #f0ede8;gap:8px;flex-wrap:wrap}
  .dp-card-hd-title{font-size:0.85rem;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px;flex-shrink:0}
  .dp-card-hd-ico{color:#6366f1;flex-shrink:0}
  .dp-cat-badge{background:#f1f5f9;color:#475569;font-size:0.72rem;font-weight:600;padding:2px 9px;border-radius:4px;border:1px solid #e2e8f0;white-space:nowrap}

  /* reference image */
  .dp-ref-img{padding:16px;background:#fafaf9;display:flex;align-items:center;justify-content:center;min-height:260px}
  .dp-ref-img img{max-width:100%;max-height:380px;object-fit:contain;display:block;border-radius:4px}
  .dp-ref-caption{padding:10px 16px;font-size:0.78rem;color:#9ca3af;border-top:1px solid #f0ede8;display:flex;align-items:center;gap:6px}

  /* gallery */
  .dp-gallery-wrap{position:relative;padding:12px 14px 4px}
  .dp-gallery-scroll{display:flex;gap:10px;overflow-x:auto;scroll-behavior:smooth;padding-bottom:10px;scroll-snap-type:x mandatory}
  .dp-gallery-scroll::-webkit-scrollbar{height:4px}
  .dp-gallery-scroll::-webkit-scrollbar-track{background:#f0ede8;border-radius:2px}
  .dp-gallery-scroll::-webkit-scrollbar-thumb{background:#c4bcb0;border-radius:2px}
  .dp-thumb{flex:0 0 100px;cursor:pointer;border:2px solid #e2e0da;border-radius:8px;overflow:hidden;background:#f9f9f7;transition:border-color 0.12s,box-shadow 0.12s;scroll-snap-align:start}
  .dp-thumb:hover{border-color:#6366f1}
  .dp-thumb.active{border-color:#1d4ed8;box-shadow:0 0 0 2px rgba(29,78,216,0.15)}
  .dp-thumb img{width:100%;height:72px;object-fit:cover;display:block}
  .dp-thumb-blank{width:100%;height:72px;background:linear-gradient(145deg,#f3f4f6,#e9ebee);display:flex;align-items:center;justify-content:center}
  .dp-thumb-overlay{background:rgba(0,0,0,0.55);padding:3px 6px;text-align:center}
  .dp-thumb-overlay span{color:#fff;font-size:0.67rem;font-weight:700;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
  .dp-thumb-name{padding:5px 6px;font-size:0.68rem;color:#374151;text-align:center;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .dp-gallery-nav{display:flex;gap:4px;flex-shrink:0}
  .dp-nav-btn{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:5px;color:#374151;font-size:1rem;padding:4px 10px;cursor:pointer;line-height:1;transition:background 0.1s;user-select:none}
  .dp-nav-btn:hover{background:#e2e8f0}
  .dp-nav-btn:active{background:#dde1e7}

  /* right panel — parts list */
  .dp-hint{display:flex;align-items:center;gap:7px;padding:9px 14px;background:#eff6ff;border-bottom:1px solid #dbeafe;font-size:0.78rem;color:#1d4ed8;font-weight:500}

  /* table */
  .dp-tbl-wrap{overflow-y:auto;overflow-x:hidden;max-height:520px}
  .dp-tbl{width:100%;border-collapse:collapse;font-size:0.84rem;table-layout:fixed}
  .dp-tbl thead th{padding:8px 8px;font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1.5px solid #f0ede8;background:#fafaf9;white-space:nowrap;position:sticky;top:0;z-index:1;overflow:hidden}
  .dp-tbl col.col-num{width:38px}
  .dp-tbl col.col-partno{width:88px}
  .dp-tbl col.col-desc{width:28%}
  .dp-tbl col.col-price{width:58px}
  .dp-tbl col.col-action{width:96px}
  .dp-tbl thead th:first-child{padding-left:14px}
  .dp-row{cursor:pointer;border-bottom:1px solid #f0ede8;transition:background 0.1s}
  .dp-row:hover{background:#f9f7f3}
  .dp-row.active{background:#eff6ff}
  .dp-td-num{padding:11px 6px 11px 14px;vertical-align:middle}
  .dp-num{width:26px;height:26px;border-radius:50%;background:#1e3a5f;color:#fff;font-size:0.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .dp-td-partno{padding:11px 6px;vertical-align:middle;overflow:hidden}
  .dp-partno{color:#e07000;font-weight:700;font-size:0.8rem;font-family:monospace;text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dp-partno:hover{text-decoration:underline}
  .dp-td-desc{padding:11px 6px;vertical-align:middle;overflow:hidden}
  .dp-desc{display:block;color:#111827;line-height:1.35;margin-bottom:3px;font-size:0.82rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dp-stock{display:inline-flex;align-items:center;gap:3px;font-size:0.7rem;color:#16a34a;font-weight:500}
  .dp-td-price{padding:11px 6px;white-space:nowrap;vertical-align:middle;overflow:hidden}
  .dp-price{font-weight:700;color:#111827;font-size:0.88rem}
  .dp-price-na{color:#9ca3af}
  .dp-td-action{padding:9px 10px 9px 4px;white-space:nowrap;vertical-align:middle;overflow:hidden}
  .dp-add-btn{display:inline-flex;align-items:center;gap:5px;background:#dc2626;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:0.78rem;font-weight:600;cursor:pointer;transition:background 0.12s;vertical-align:middle;white-space:nowrap}
  .dp-add-btn:hover{background:#b91c1c}
  .dp-add-btn:disabled{opacity:0.6;cursor:default}
  .dp-chevbtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #e2e0da;border-radius:5px;color:#6b7280;text-decoration:none;vertical-align:middle;margin-left:4px;transition:background 0.1s;flex-shrink:0}
  .dp-chevbtn:hover{background:#f3f2ef;color:#1a1a1a}

  /* pagination */
  .dp-pager{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid #f0ede8;background:#fafaf9;gap:8px}
  .dp-pg-btn{background:#fff;border:1.5px solid #e2e0da;border-radius:6px;color:#374151;font-size:0.78rem;font-weight:600;padding:5px 12px;cursor:pointer;transition:background 0.1s,border-color 0.1s}
  .dp-pg-btn:hover:not(:disabled){background:#f1f5f9;border-color:#c4bcb0}
  .dp-pg-btn:disabled{opacity:0.4;cursor:default}
  .dp-pg-info{font-size:0.78rem;color:#6b7280;white-space:nowrap}

  /* parts list footer */
  .dp-parts-foot{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1.5px solid #f0ede8;background:#fafaf9}
  .dp-foot-stock{font-size:0.78rem;color:#6b7280}
  .dp-foot-all{font-size:0.78rem;color:#1d4ed8;font-weight:600;text-decoration:none}
  .dp-foot-all:hover{text-decoration:underline}

  /* pdf / empty fallback */
  .dp-pdf{text-align:center;padding:40px 20px}
  .dp-pdf a{display:inline-block;background:#1d4ed8;color:#fff;border-radius:7px;padding:11px 24px;font-weight:600;text-decoration:none}
  .dp-pdf a:hover{background:#1e40af}
  .dp-empty{text-align:center;padding:48px 20px;color:#6b7280}

  @media(max-width:640px){
    .dp{padding:16px 12px}
    .dp-hd h1{font-size:1.2rem}
    .dp-tbl-wrap{max-height:360px}
  }
</style>

<!-- page header -->
<div class="dp-hd">
  <h1>${esc(diagram.title)} &ndash; Exploded Diagram</h1>
  <p>Select the part you need from the list or gallery below.</p>
  <div class="dp-other">
    <span class="dp-other-label">Other diagrams:</span>
    ${otherPills}
  </div>
</div>

<!-- two-column body -->
<div class="dp-body">

  <!-- LEFT: reference + gallery -->
  <div class="dp-left">

    <!-- reference image card -->
    <div class="dp-card" style="margin-bottom:16px">
      <div class="dp-card-hd">
        <span class="dp-card-hd-title">
          <span class="dp-card-hd-ico">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/></svg>
          </span>
          ${esc(diagram.title)}: Product Reference
        </span>
        ${catBadge ? `<span class="dp-cat-badge">${esc(catBadge)}</span>` : ""}
      </div>
      <div class="dp-ref-img">
        ${diagram.imageUrl
          ? `<img id="dp-main-img" src="${esc(diagram.imageUrl)}" alt="${esc(diagram.title)}" />`
          : `<div style="color:#c4ccd5;font-size:0.9rem;text-align:center">No image available</div>`
        }
      </div>
      <div class="dp-ref-caption">
        ${icoInfo}
        Use this image as a visual reference, then find your part in the gallery or table.
      </div>
    </div>

    ${hasProds ? `
    <!-- parts gallery card -->
    <div class="dp-card">
      <div class="dp-card-hd">
        <span class="dp-card-hd-title">
          <span class="dp-card-hd-ico">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5zm8 0a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2zm-8 8a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H5zm8 0a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2z"/></svg>
          </span>
          Parts Gallery &mdash; ${partCount} part${partCount !== 1 ? "s" : ""}
        </span>
        <div class="dp-gallery-nav">
          <button class="dp-nav-btn" id="dp-gall-left" type="button">&lsaquo;</button>
          <button class="dp-nav-btn" id="dp-gall-right" type="button">&rsaquo;</button>
        </div>
      </div>
      <div class="dp-gallery-wrap">
        <div class="dp-gallery-scroll" id="dp-gallery">
          ${galleryItems}
        </div>
      </div>
    </div>
    ` : ""}
  </div>

  <!-- RIGHT: parts list -->
  <div class="dp-right">
    ${hasProds ? `
    <div class="dp-card">
      <div class="dp-card-hd">
        <span class="dp-card-hd-title">
          <span class="dp-card-hd-ico">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7z"/></svg>
          </span>
          Parts List: ${esc(diagram.title)}
        </span>
        <span style="font-size:0.78rem;color:#6b7280">${partCount} parts</span>
      </div>
      <div class="dp-hint">${icoInfo} Click any row to highlight it in the gallery above &uarr;</div>
      <div class="dp-tbl-wrap" id="dp-tbl-wrap">
        <table class="dp-tbl">
          <colgroup>
            <col class="col-num" /><col class="col-partno" /><col class="col-desc" /><col class="col-price" /><col class="col-action" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Part No.</th>
              <th>Description</th>
              <th>Price</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="dp-tbody">
            ${partRows}
          </tbody>
        </table>
      </div>
      ${pagerHtml}
      <div class="dp-parts-foot">
        <span class="dp-foot-stock" id="dp-stock-label">${partCount} of ${partCount} parts in stock</span>
        <a class="dp-foot-all" href="/collections/all">All ${esc(diagram.title)} Parts &rsaquo;</a>
      </div>
    </div>
    ` : diagram.fileUrl ? `
    <div class="dp-card dp-pdf">
      <p style="color:#6b7280;margin-bottom:14px">Download the parts document for this model:</p>
      <a href="${esc(diagram.fileUrl)}" target="_blank" rel="noopener">Download PDF</a>
    </div>
    ` : `
    <div class="dp-card dp-empty">
      <p>No parts or document available for this diagram yet.</p>
    </div>
    `}
  </div>
</div>

<script>
(function() {
  var PAGE_SIZE = ${PAGE_SIZE};
  var mainImg = document.getElementById('dp-main-img');
  var gallery = document.getElementById('dp-gallery');
  var allRows = gallery ? [] : null;

  /* ── Gallery scroll ─────────────────────────────────────────── */
  var gallLeft  = document.getElementById('dp-gall-left');
  var gallRight = document.getElementById('dp-gall-right');

  function scrollGallery(dir) {
    if (!gallery) return;
    gallery.scrollBy({ left: dir * 300, behavior: 'smooth' });
  }

  if (gallLeft)  gallLeft.addEventListener('click',  function() { scrollGallery(-1); });
  if (gallRight) gallRight.addEventListener('click', function() { scrollGallery(1); });

  /* ── Thumbnail click → swap image + highlight row ───────────── */
  if (gallery) {
    gallery.addEventListener('click', function(e) {
      var thumb = e.target.closest('.dp-thumb');
      if (!thumb) return;
      var img = thumb.dataset.img;
      if (img && mainImg) mainImg.src = img;
      gallery.querySelectorAll('.dp-thumb').forEach(function(t) { t.classList.remove('active'); });
      thumb.classList.add('active');
      var pid = thumb.dataset.productId;
      var row = document.querySelector('.dp-row[data-pid="' + pid + '"]');
      if (row) {
        document.querySelectorAll('.dp-row').forEach(function(r) { r.classList.remove('active'); });
        row.classList.add('active');
        /* jump to the correct pagination page */
        var idx = parseInt(row.dataset.index, 10);
        if (!isNaN(idx)) showPage(Math.floor(idx / PAGE_SIZE));
        setTimeout(function() { row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
      }
    });
  }

  /* ── Table row click → swap image + highlight thumb ────────── */
  function bindRows() {
    document.querySelectorAll('.dp-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e.target.closest('a, button')) return;
        var img = row.dataset.img;
        if (img && mainImg) mainImg.src = img;
        document.querySelectorAll('.dp-row').forEach(function(r) { r.classList.remove('active'); });
        row.classList.add('active');
        var pid = row.dataset.pid;
        if (gallery) {
          gallery.querySelectorAll('.dp-thumb').forEach(function(t) { t.classList.remove('active'); });
          var thumb = gallery.querySelector('.dp-thumb[data-product-id="' + pid + '"]');
          if (thumb) {
            thumb.classList.add('active');
            gallery.scrollTo({ left: thumb.offsetLeft - 20, behavior: 'smooth' });
          }
        }
      });
    });
  }

  /* ── Add to cart ─────────────────────────────────────────────── */
  function updateThemeCartCount(count) {
    /* covers Dawn, Debut, Horizon and most popular themes */
    var selectors = [
      '[data-cart-count]','[data-cart-item-count]',
      '.cart-count','#CartCount',
      '.header__cart-count','.cart-link__bubble-num',
      '.cart-item-count','.icon-cart__item-count'
    ];
    selectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.textContent = String(count);
        el.setAttribute('aria-label', count + ' items');
        /* show bubble if it was hidden */
        el.closest('[class*="bubble"],[class*="badge"]')
          ?.classList.remove('hidden','is-empty','cart-count--empty');
      });
    });
    /* fire events that themes like Dawn / Impulse listen to */
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { item_count: count } }));
    document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
  }

  function bindCartBtns() {
    document.querySelectorAll('.dp-add-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var variantId = btn.dataset.variantId;
        if (!variantId) return;
        var originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Adding&hellip;';

        fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
        })
        .then(function(r) {
          if (!r.ok) {
            return r.json().then(function(e) {
              throw new Error(e.description || e.message || 'Add to cart failed');
            });
          }
          return r.json();
        })
        .then(function() {
          btn.innerHTML = '&#10003; Added!';
          /* fetch current cart to update theme header count */
          fetch('/cart.js', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function(r) { return r.json(); })
            .then(function(cart) { updateThemeCartCount(cart.item_count); })
            .catch(function() {});
          setTimeout(function() {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
          }, 2200);
        })
        .catch(function(err) {
          console.error('[diagram] add to cart error:', err.message);
          btn.innerHTML = '&#9888; ' + (err.message || 'Error');
          setTimeout(function() {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
          }, 3000);
        });
      });
    });
  }

  /* ── Pagination ──────────────────────────────────────────────── */
  var curPage = 0;
  var rows = Array.from(document.querySelectorAll('.dp-row'));
  var totalRows = rows.length;
  var totalPages = Math.ceil(totalRows / PAGE_SIZE);

  function showPage(page) {
    curPage = Math.max(0, Math.min(page, totalPages - 1));
    rows.forEach(function(row, i) {
      row.style.display = (i >= curPage * PAGE_SIZE && i < (curPage + 1) * PAGE_SIZE) ? '' : 'none';
    });
    var start = curPage * PAGE_SIZE + 1;
    var end   = Math.min((curPage + 1) * PAGE_SIZE, totalRows);
    var info  = document.getElementById('dp-pg-info');
    if (info) info.textContent = start + '–' + end + ' of ' + totalRows;
    var prev = document.getElementById('dp-pg-prev');
    var next = document.getElementById('dp-pg-next');
    if (prev) prev.disabled = curPage === 0;
    if (next) next.disabled = curPage >= totalPages - 1;
    var wrap = document.getElementById('dp-tbl-wrap');
    if (wrap) wrap.scrollTop = 0;
  }

  var prevBtn = document.getElementById('dp-pg-prev');
  var nextBtn = document.getElementById('dp-pg-next');
  if (prevBtn) prevBtn.addEventListener('click', function() { showPage(curPage - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function() { showPage(curPage + 1); });

  /* initial render */
  if (totalPages > 1) showPage(0);

  bindRows();
  bindCartBtns();
})();
</script>
</div>
`;

  return new Response(html, {
    headers: { "Content-Type": "application/liquid" },
  });
};

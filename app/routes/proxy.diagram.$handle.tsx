import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Escape user-generated content to prevent XSS in raw HTML strings
const esc = (s: string | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const diagram = await db.diagram.findUnique({
    where: { handle: params.handle },
    include: { products: { orderBy: { sortOrder: "asc" } } },
  });

  if (!diagram) {
    return new Response("<h2>Diagram not found</h2>", {
      status: 404,
      headers: { "Content-Type": "application/liquid" },
    });
  }

  const hasProducts = diagram.products.length > 0;

  const html = `
<div class="diagram-page">
  <style>
    .diagram-page { max-width: 1100px; margin: 0 auto; padding: 24px 16px; font-family: inherit; }
    .diagram-hero img { width: 100%; max-height: 480px; object-fit: contain; border-radius: 8px; background: #f6f6f7; }
    .diagram-caption { text-align: center; color: #6d7175; font-size: 0.9rem; margin: 8px 0 24px; }
    .diagram-gallery { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 28px; }
    .gallery-card { flex: 0 0 120px; cursor: pointer; border: 2px solid transparent; border-radius: 8px; padding: 8px; text-align: center; background: #fff; transition: border-color 0.15s; }
    .gallery-card:hover, .gallery-card.active { border-color: #008060; }
    .gallery-card img { width: 80px; height: 80px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto 6px; }
    .gallery-card .part-no { font-size: 0.75rem; font-weight: 600; color: #202223; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gallery-card .part-name { font-size: 0.7rem; color: #6d7175; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .parts-table-wrap { overflow-x: auto; }
    #parts-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    #parts-table th { text-align: left; border-bottom: 2px solid #e1e3e5; padding: 10px 12px; font-weight: 600; color: #202223; }
    #parts-table td { padding: 10px 12px; border-bottom: 1px solid #e1e3e5; vertical-align: middle; }
    #parts-table tbody tr { cursor: pointer; transition: background 0.1s; }
    #parts-table tbody tr:hover { background: #f6f6f7; }
    #parts-table tbody tr.active { background: #e3f1ec; }
    .part-thumb { width: 48px; height: 48px; object-fit: contain; border-radius: 4px; display: block; }
    .btn { display: inline-block; padding: 8px 14px; border-radius: 4px; font-size: 0.85rem; font-weight: 500; text-decoration: none; cursor: pointer; border: 1px solid transparent; }
    .btn-secondary { background: #fff; border-color: #babec3; color: #202223; }
    .btn-primary { background: #008060; color: #fff; border-color: transparent; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .pdf-section { text-align: center; padding: 40px 0; }
    .pdf-link { display: inline-block; padding: 12px 24px; background: #008060; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600; }
  </style>

  <!-- Hero image -->
  <div class="diagram-hero">
    <img id="main-diagram-image" src="${esc(diagram.imageUrl)}" alt="${esc(diagram.title)}" />
  </div>
  <p class="diagram-caption">Use this image as a visual reference for the parts below.</p>

  ${
    hasProducts
      ? `
  <!-- Parts gallery -->
  <div class="diagram-gallery">
    ${diagram.products
      .map(
        (p) => `
    <div
      class="gallery-card"
      id="card-${esc(p.productId)}"
      data-product-id="${esc(p.productId)}"
      data-img="${esc(p.productImageUrl ?? "")}"
    >
      ${p.productImageUrl ? `<img src="${esc(p.productImageUrl)}" alt="${esc(p.productTitle)}" />` : `<div style="width:80px;height:80px;background:#f6f6f7;border-radius:4px;margin:0 auto 6px;"></div>`}
      <div class="part-no">${esc(p.productHandle)}</div>
      <div class="part-name">${esc(p.productTitle)}</div>
    </div>`,
      )
      .join("")}
  </div>

  <!-- Parts list -->
  <div class="parts-table-wrap">
    <table id="parts-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Image</th>
          <th>Part No.</th>
          <th>Description</th>
          <th>Price</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${diagram.products
          .map(
            (p, i) => `
        <tr
          id="row-${esc(p.productId)}"
          data-img="${esc(p.productImageUrl ?? "")}"
          data-variant-id="${esc(p.variantId)}"
        >
          <td>${i + 1}</td>
          <td>${p.productImageUrl ? `<img class="part-thumb" src="${esc(p.productImageUrl)}" alt="${esc(p.productTitle)}" />` : "—"}</td>
          <td>${esc(p.productHandle)}</td>
          <td>${esc(p.productTitle)}</td>
          <td>${p.productPrice ? `$${esc(p.productPrice)}` : "—"}</td>
          <td>
            <a class="btn btn-secondary" href="/products/${esc(p.productHandle)}" style="margin-right:6px">View</a>
            <button
              class="btn btn-primary"
              data-variant-id="${esc(p.variantId)}"
              onclick="addToCart(this, '${esc(p.variantId)}')"
            >Add to cart</button>
          </td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>
  `
      : diagram.fileUrl
        ? `
  <div class="pdf-section">
    <p>Download the parts document for this model:</p>
    <a class="pdf-link" href="${esc(diagram.fileUrl)}" target="_blank" rel="noopener">
      Download PDF
    </a>
  </div>
  `
        : `<p>No parts or document available for this diagram yet.</p>`
  }

  <script>
    var mainImg = document.getElementById('main-diagram-image');

    // Gallery card click → swap main image + highlight row
    document.querySelectorAll('.gallery-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var img = card.dataset.img;
        if (img && mainImg) mainImg.src = img;
        document.querySelectorAll('.gallery-card').forEach(function(c) { c.classList.remove('active'); });
        card.classList.add('active');
        var row = document.getElementById('row-' + card.dataset.productId);
        if (row) {
          document.querySelectorAll('#parts-table tbody tr').forEach(function(r) { r.classList.remove('active'); });
          row.classList.add('active');
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });

    // Table row click → swap main image + highlight card
    document.querySelectorAll('#parts-table tbody tr').forEach(function(row) {
      row.addEventListener('click', function() {
        var img = row.dataset.img;
        if (img && mainImg) mainImg.src = img;
        document.querySelectorAll('#parts-table tbody tr').forEach(function(r) { r.classList.remove('active'); });
        row.classList.add('active');
        var pid = row.id.replace('row-', '');
        document.querySelectorAll('.gallery-card').forEach(function(c) { c.classList.remove('active'); });
        var card = document.getElementById('card-' + pid);
        if (card) card.classList.add('active');
      });
    });

    // Add to cart via Shopify AJAX API
    function addToCart(btn, variantId) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
      })
      .then(function(r) { return r.json(); })
      .then(function() {
        btn.textContent = 'Added!';
        setTimeout(function() { btn.textContent = 'Add to cart'; btn.disabled = false; }, 2000);
      })
      .catch(function() {
        btn.textContent = 'Error';
        btn.disabled = false;
      });
    }
  </script>
</div>
`;

  return new Response(html, {
    headers: { "Content-Type": "application/liquid" },
  });
};

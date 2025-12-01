/* script.js: widget TUPA/TUSNE + export PDF (landscape) + modal + paginación
   Dependencias (ya incluidas en index.html):
   - PapaParse
   - Fuse.js (opcional)
   - jsPDF + autoTable
*/

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSvu5g5Ubgccjk_GafzxPj7J1WQYvlFLWD4OURUQQ8BgTKREDec4R5aXNRoqOgU9avsFvggsWfafWyS/pub?gid=1276577330&single=true&output=csv";

// DOM
const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const cardsContainer = document.getElementById("cardsContainer");
const statusEl = document.getElementById("status");
const paginationEl = document.getElementById("pagination");

const minMontoInput = document.getElementById("minMonto");
const maxMontoInput = document.getElementById("maxMonto");
const minMontoValue = document.getElementById("minMontoValue");
const maxMontoValue = document.getElementById("maxMontoValue");

// Modal
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalUnidad = document.getElementById("modalUnidad");
const modalArea = document.getElementById("modalArea");
const modalCorreo = document.getElementById("modalCorreo");
const modalTelefono = document.getElementById("modalTelefono");
const modalRequisitos = document.getElementById("modalRequisitos");
const modalCloseBtn = document.getElementById("modalClose");

// Data containers
let rawData = [];
let mappedData = [];
let fuse = null;
let filteredData = [];
let pageSize = 21;
let currentPage = 1;

// Helpers
function keyify(s){ return s ? s.toString().trim().toLowerCase().replace(/\s+/g," ") : ""; }

function parseMonto(v){
  if(!v) return 0;
  let s = v.toString().trim();
  s = s.replace(/S\/|s\/|soles|sol/gi, "");
  s = s.replace(/\s/g,"");
  s = s.replace(/,/g,".");
  s = s.replace(/[^0-9.]/g,"");
  const parts = s.split(".");
  if(parts.length>2){
    const dec = parts.pop();
    s = parts.join("") + "." + dec;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function escapeHTML(s){
  if(!s) return "";
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

// Map CSV row robustly
function mapRow(row){
  const normalized = {};
  Object.keys(row || {}).forEach(k => normalized[keyify(k)] = (row[k] || "").toString().trim());

  const out = {};
  out.origen = normalized["tupa/tusne"] || normalized["origen"] || "";
  out.unidad = normalized["centro de costo"] || normalized["unidad responsable"] || "";
  out.cxc = normalized["cxc"] || "";
  out.area = normalized["área responsable de brindar el servicio"] || normalized["area responsable de brindar el servicio"] || normalized["area"] || out.unidad;
  out.proceso = normalized["proceso"] || "";
  out.tarifa = normalized["tarifas"] || normalized["tarifa"] || normalized["denominación de la tarifa"] || "";
  out.montoRaw = normalized["monto"] || "";
  out.monto = parseMonto(out.montoRaw);
  out.requisitos = normalized["requisitos generales"] || normalized["requisitos"] || "";
  out.correo = normalized["correo"] || "";
  out.celular = (normalized["n° celular"] || normalized["numero celular"] || normalized["celular"] || "").replace(/\s/g,"");
  return out;
}

// Load CSV
function loadCSV(url){
  statusEl.textContent = "Cargando datos desde Google Sheets...";
  if(typeof Papa === "undefined"){
    statusEl.textContent = "Error: PapaParse no está cargado.";
    console.error("PapaParse missing");
    return;
  }

  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: results => {
      rawData = results.data || [];
      mappedData = rawData.map(mapRow).filter(r => r && (r.tarifa || r.proceso));
      if(mappedData.length === 0){
        statusEl.textContent = "No se encontraron registros en la hoja.";
        return;
      }
      initFuse();
      initMontoRange();
      populateFilters();
      applyAllFilters();
      statusEl.classList.add("hidden");
    },
    error: err => {
      console.error("PapaParse error:", err);
      statusEl.textContent = "Error cargando datos. Revisa consola.";
    }
  });
}

function initFuse(){
  if(typeof Fuse !== "undefined"){
    fuse = new Fuse(mappedData, {
      keys: [
        {name: "proceso", weight: 0.9},
        {name: "tarifa", weight: 0.8},
        {name: "unidad", weight: 0.7},
        {name: "area", weight: 0.5}
      ],
      threshold: 0.35
    });
  } else {
    fuse = null;
  }
}

// Monto slider bounds
function initMontoRange(){
  const montos = mappedData.map(r => r.monto || 0);
  const min = Math.min(...montos);
  const max = Math.max(...montos);

  const pad = Math.max(1, Math.round(max * 0.02));
  const low = Math.max(0, Math.floor(min) - pad);
  const high = Math.ceil(max) + pad;

  minMontoInput.min = low;
  minMontoInput.max = high;
  maxMontoInput.min = low;
  maxMontoInput.max = high;

  minMontoInput.value = low;
  maxMontoInput.value = high;

  minMontoValue.textContent = low;
  maxMontoValue.textContent = high;

  minMontoInput.addEventListener("input", onSliderChange);
  maxMontoInput.addEventListener("input", onSliderChange);
}

function onSliderChange(){
  let a = Number(minMontoInput.value);
  let b = Number(maxMontoInput.value);
  if(a > b) [a,b] = [b,a];
  minMontoValue.textContent = a;
  maxMontoValue.textContent = b;
  currentPage = 1;
  applyAllFilters();
}

// populate unidad filter
function populateFilters(){
  const unidades = Array.from(new Set(mappedData.map(d => d.unidad).filter(Boolean))).sort();
  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
  unidades.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u; opt.textContent = u;
    unidadFilter.appendChild(opt);
  });
  unidadFilter.onchange = () => { currentPage = 1; applyAllFilters(); };
}

// Apply search + filters + monto + ordering
function applyAllFilters(){
  const q = (searchInput.value || "").trim();
  const unidad = unidadFilter.value;
  const minV = Math.min(Number(minMontoInput.value), Number(maxMontoInput.value));
  const maxV = Math.max(Number(minMontoInput.value), Number(maxMontoInput.value));

  let results = mappedData.slice();

  if(q.length >= 2 && fuse){
    const res = fuse.search(q);
    results = res.map(r => r.item);
  } else if(q.length >= 2){
    const ql = q.toLowerCase();
    results = results.filter(r =>
      (r.proceso || "").toLowerCase().includes(ql) ||
      (r.tarifa || "").toLowerCase().includes(ql) ||
      (r.unidad || "").toLowerCase().includes(ql) ||
      (r.area || "").toLowerCase().includes(ql)
    );
  }

  if(unidad) results = results.filter(r => r.unidad === unidad);

  results = results.filter(r => (r.monto || 0) >= minV && (r.monto || 0) <= maxV);

  // TUPA first
  results.sort((a,b) => {
    const ao = ((a.origen||"") + "").toLowerCase();
    const bo = ((b.origen||"") + "").toLowerCase();
    if(ao === "tupa" && bo !== "tupa") return -1;
    if(ao !== "tupa" && bo === "tupa") return 1;
    return 0;
  });

  filteredData = results;
  renderPage(1);
}

// Pagination / render
function renderPage(page){
  currentPage = page;
  const total = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if(page < 1) page = 1;
  if(page > totalPages) page = totalPages;

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = filteredData.slice(start, end);

  renderCards(pageItems, start);
  renderPagination(totalPages, page);
  window.scrollTo({ top: document.querySelector(".container").offsetTop - 10, behavior: "smooth" });
}

function renderCards(items){
  cardsContainer.innerHTML = "";
  if(!items || items.length === 0){
    cardsContainer.innerHTML = `<div class="status">No se encontraron resultados.</div>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <div class="tag-origen">${escapeHTML(item.origen || "")}</div>
      <div class="card-title">${escapeHTML(item.proceso || "—")}</div>

      <div class="meta"><strong>Tarifa:</strong> ${escapeHTML(item.tarifa || "—")}</div>
      <div class="meta"><strong>Monto:</strong> S/ ${escapeHTML((item.monto || 0).toString())}</div>
      <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad || "—")}</div>
      <div class="meta"><strong>Área:</strong> ${escapeHTML(item.area || "—")}</div>

      <div class="actions">
        <button class="btn btn-requisitos" data-item='${encodeURIComponent(JSON.stringify(item))}'><i class="bi bi-list-check"></i> Requisitos</button>
        <a class="btn btn-mail" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.correo||"")}" target="_blank" rel="noopener noreferrer"><i class="bi bi-envelope-fill"></i> Correo</a>
        <a class="btn btn-ws" href="https://wa.me/51${encodeURIComponent((item.celular||"").replace(/\D/g,""))}" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp"></i> WhatsApp</a>
      </div>
    `;

    const reqBtn = div.querySelector(".btn-requisitos");
    if(reqBtn){
      reqBtn.addEventListener("click", () => {
        const it = JSON.parse(decodeURIComponent(reqBtn.getAttribute("data-item")));
        openModal(it);
      });
    }

    cardsContainer.appendChild(div);
  });
}

// Pagination UI
function renderPagination(totalPages, current){
  paginationEl.innerHTML = "";
  if(totalPages <= 1) return;

  const createBtn = (txt, cls, onClick) => {
    const b = document.createElement("button");
    b.className = cls || "page-btn";
    b.textContent = txt;
    b.addEventListener("click", onClick);
    return b;
  };

  paginationEl.appendChild(createBtn("«", "page-btn", () => renderPage(1)));
  paginationEl.appendChild(createBtn("‹", "page-btn", () => renderPage(Math.max(1, current-1))));

  const maxButtons = 7;
  let start = Math.max(1, current - Math.floor(maxButtons/2));
  let end = Math.min(totalPages, start + maxButtons - 1);
  if(end - start < maxButtons -1){
    start = Math.max(1, end - maxButtons + 1);
  }

  for(let p = start; p<=end; p++){
    const cls = p === current ? "page-btn active" : "page-btn";
    paginationEl.appendChild(createBtn(p, cls, () => renderPage(p)));
  }

  paginationEl.appendChild(createBtn("›", "page-btn", () => renderPage(Math.min(totalPages, current+1))));
  paginationEl.appendChild(createBtn("»", "page-btn", () => renderPage(totalPages)));
}

// Modal open/close
function openModal(item){
  modalTitle.textContent = item.tarifa || item.proceso || "Detalle";

  // populate meta (plain text in spans; links are outside)
  modalUnidad.textContent = item.unidad || "—";
  modalArea.textContent = item.area || "—";

  if(item.correo){
    modalCorreo.textContent = item.correo;
    const link = document.getElementById("modalCorreoLink");
    link.href = `mailto:${item.correo}`;
  } else {
    modalCorreo.textContent = "—";
    document.getElementById("modalCorreoLink").href = "#";
  }

  const cel = (item.celular || "").replace(/\D/g,"");
  if(cel){
    modalTelefono.textContent = cel;
    const link = document.getElementById("modalTelefonoLink");
    link.href = `https://wa.me/51${cel}`;
  } else {
    modalTelefono.textContent = "—";
    document.getElementById("modalTelefonoLink").href = "#";
  }

  // Requisitos -> list
  let text = item.requisitos || "No especificado";
  let parts = [];
  if(text.includes("\n")) parts = text.split(/\n+/);
  else if(text.includes(";")) parts = text.split(/\s*;\s*/);
  else if(text.includes(".") && text.length > 40) parts = text.split(/\.\s+/).filter(Boolean);
  else parts = [text];

  modalRequisitos.innerHTML = "";
  const ul = document.createElement("ul");
  parts.forEach(p => {
    const li = document.createElement("li"); li.textContent = p.trim();
    ul.appendChild(li);
  });
  modalRequisitos.appendChild(ul);

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal(){
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

if(modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay) closeModal(); });

// Search and inputs
searchInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });
minMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });
maxMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

// Export PDF (landscape) - Table style institucional
exportPdfBtn.addEventListener("click", () => {
  // choose items to export: if unidad selected, filter by that; else export filteredData
  const unidad = unidadFilter.value;
  let items = filteredData.slice();
  if(unidad){
    items = items.filter(it => it.unidad === unidad);
  }

  if(!items || items.length === 0){
    alert("No hay registros para exportar con los filtros actuales.");
    return;
  }

  // Use jsPDF (UMD)
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });

  // Header institucional
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(0, 56, 102); // azul oscuro
  doc.rect(0, 0, pageWidth, 48, "F");
  doc.setFontSize(16);
  doc.setTextColor(255,255,255);
  doc.text("Tarifario TUPA / TUSNE - Reporte", 18, 33);

  // Small notice below header
  doc.setFontSize(10);
  doc.setTextColor(20,20,20);
  doc.text("Valores son estimados. Verifique cobros finales en la entidad recaudadora.", 18, 64);

  // Prepare table columns (requisitos column wide ~45% of content width)
  const marginLeft = 18;
  const usableWidth = pageWidth - marginLeft*2;
  const colWidths = {
    proceso: Math.round(usableWidth * 0.18),
    tarifa: Math.round(usableWidth * 0.16),
    monto: Math.round(usableWidth * 0.09),
    area: Math.round(usableWidth * 0.12),
    origen: Math.round(usableWidth * 0.10),
    requisitos: Math.round(usableWidth * 0.35) // ≈45% originally; adjusted to fit
  };

  // autoTable columns
  const columns = [
    { header: "Proceso", dataKey: "proceso" },
    { header: "Tarifa", dataKey: "tarifa" },
    { header: "Monto (S/)", dataKey: "monto" },
    { header: "Área", dataKey: "area" },
    { header: "Origen", dataKey: "origen" },
    { header: "Requisitos", dataKey: "requisitos" },
  ];

  // build rows
  const rows = items.map(it => ({
    proceso: it.proceso || "—",
    tarifa: it.tarifa || "—",
    monto: (it.monto || 0).toString(),
    area: it.area || "—",
    origen: it.origen || "—",
    requisitos: doc.splitTextToSize(it.requisitos || "No especificado", colWidths.requisitos - 8)
  }));

  // autoTable options - styles for institutional look
  doc.autoTable({
    startY: 86,
    head: [columns.map(c => c.header)],
    body: rows.map(r => [r.proceso, r.tarifa, r.monto, r.area, r.origen, r.requisitos]),
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [0,56,102], textColor: 255, halign: "center", fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: colWidths.proceso },
      1: { cellWidth: colWidths.tarifa },
      2: { cellWidth: colWidths.monto, halign: "right" },
      3: { cellWidth: colWidths.area },
      4: { cellWidth: colWidths.origen },
      5: { cellWidth: colWidths.requisitos }
    },
    margin: { left: marginLeft, right: marginLeft },
    didDrawPage: (dataArg) => {
      // footer with page number
      const pageCount = doc.internal.getNumberOfPages();
      const page = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Página ${page} / ${pageCount}`, pageWidth - marginLeft - 80, doc.internal.pageSize.getHeight() - 10);
    },
    showHead: "everyPage",
    theme: "grid",
    willDrawCell: function() {}
  });

  // Download
  doc.save(`Tarifario_UNH_${(unidad||"Todos")}.pdf`);
});

// start
if(!CSV_URL){
  statusEl.textContent = "No se ha configurado la URL del CSV.";
} else {
  loadCSV(CSV_URL);
}

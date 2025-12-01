/* script.js
   - PapaParse CSV parsing
   - Fuse.js fuzzy search (if available)
   - double-range slider for monto
   - pagination (21 per page)
   - modal with requisitos
   - export to PDF (jsPDF + autoTable)
*/

// --- CONFIG: CSV public URL (tu hoja publicada a CSV)
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSvu5g5Ubgccjk_GafzxPj7J1WQYvlFLWD4OURUQQ8BgTKREDec4R5aXNRoqOgU9avsFvggsWfafWyS/pub?gid=1276577330&single=true&output=csv";

// DOM elements
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

// Data
let rawData = [];
let mappedData = [];
let fuse = null;
let filteredData = [];
let pageSize = 21;
let currentPage = 1;

// Utility: normalize header names
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
  out.origen = normalized["tupa/tusne"] || normalized["tupa/tusne (origen de la tarifa)"] || normalized["origen"] || "";
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

// Load CSV via PapaParse
function loadCSV(url){
  statusEl.textContent = "Cargando datos...";
  if(typeof Papa === "undefined"){
    statusEl.textContent = "Error: PapaParse no está cargado.";
    console.error("PapaParse no encontrado.");
    return;
  }

  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: result => {
      rawData = result.data || [];
      mappedData = rawData.map(mapRow).filter(r => r && (r.tarifa || r.proceso));
      if(mappedData.length === 0){
        statusEl.textContent = "No se encontraron registros.";
        return;
      }

      // Fuse for fuzzy search if available
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

      initMontoRange();
      populateFilters();
      applyAllFilters();

      statusEl.classList.add("hidden");
    },
    error: err => {
      console.error("PapaParse error:", err);
      statusEl.textContent = "Error cargando datos. Revisa la consola.";
    }
  });
}

// Init monto slider
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

  // listeners
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

// Populate Unidad select
function populateFilters(){
  const unidades = Array.from(new Set(mappedData.map(d => d.unidad).filter(Boolean))).sort();
  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
  unidades.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u; opt.textContent = u;
    unidadFilter.appendChild(opt);
  });

  unidadFilter.onchange = () => {
    currentPage = 1;
    // enable/disable export button
    exportPdfBtn.disabled = !Boolean(unidadFilter.value);
    applyAllFilters();
  };
}

// Apply search + filters + monto + ordering
function applyAllFilters(){
  const q = (searchInput.value || "").trim();
  const unidad = unidadFilter.value;
  const minV = Math.min(Number(minMontoInput.value), Number(maxMontoInput.value));
  const maxV = Math.max(Number(minMontoInput.value), Number(maxMontoInput.value));

  let results = mappedData.slice();

  // fuzzy search
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

  // monto filter
  results = results.filter(r => (r.monto || 0) >= minV && (r.monto || 0) <= maxV);

  // TUPA first ordering
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

// Pagination & render
function renderPage(page){
  currentPage = page;
  const total = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if(page < 1) page = 1;
  if(page > totalPages) page = totalPages;

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = filteredData.slice(start, end);

  renderCards(pageItems);
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

    const montoDisplay = item.monto ? item.monto.toString() : (item.montoRaw || "0");

    div.innerHTML = `
      <div class="tag-origen">Origen: ${escapeHTML(item.origen || "")}</div>
      <div class="card-title">${escapeHTML(item.proceso || (item.tarifa || "—"))}</div>

      <div class="meta"><strong>Tarifa:</strong> ${escapeHTML(item.tarifa || "—")}</div>
      <div class="meta"><strong>Monto:</strong> S/ ${escapeHTML(montoDisplay)}</div>
      <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad || "—")}</div>
      <div class="meta"><strong>Área:</strong> ${escapeHTML(item.area || "—")}</div>

      <div class="actions">
        <button class="btn btn-requisitos" data-item='${encodeURIComponent(JSON.stringify(item))}'><i class="bi bi-list-check"></i> Requisitos</button>
        <a class="btn btn-mail" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.correo||"")}" target="_blank" rel="noopener noreferrer"><i class="bi bi-envelope-fill"></i> Correo</a>
        <a class="btn btn-ws" href="https://wa.me/51${encodeURIComponent((item.celular||"").replace(/\D/g,""))}" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp"></i> WhatsApp</a>
      </div>
    `;

    const reqBtn = div.querySelector(".btn-requisitos");
    reqBtn.addEventListener("click", () => {
      const it = JSON.parse(decodeURIComponent(reqBtn.getAttribute("data-item")));
      openModal(it);
    });

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

// Modal functions
function openModal(item){
  modalTitle.textContent = item.tarifa || item.proceso || "Detalle";
  modalUnidad.textContent = item.unidad || "—";
  modalArea.textContent = item.area || "—";

  if(item.correo){
    modalCorreo.textContent = item.correo;
    document.getElementById("modalCorreoLink").href = `mailto:${item.correo}`;
  } else {
    modalCorreo.textContent = "—";
    document.getElementById("modalCorreoLink").href = "#";
  }

  const cel = (item.celular || "").replace(/\D/g,"");
  if(cel){
    modalTelefono.textContent = cel;
    document.getElementById("modalTelefonoLink").href = `https://wa.me/51${cel}`;
  } else {
    modalTelefono.textContent = "—";
    document.getElementById("modalTelefonoLink").href = "#";
  }

  // requisitos -> list
  let text = item.requisitos || "No especificado";
  let parts = [];
  if(text.includes("\n")) parts = text.split(/\n+/);
  else if(text.includes(";")) parts = text.split(/\s*;\s*/);
  else if(text.includes(".") && text.length > 40) parts = text.split(/\.\s+/).filter(Boolean);
  else parts = [text];

  modalRequisitos.innerHTML = "";
  const ul = document.createElement("ul");
  parts.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.trim();
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

// Search and input handlers
searchInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

// slider listeners already set in initMontoRange

// ========= PDF EXPORT (Unidad) =========
async function exportFilteredUnitPDF(){
  const unidad = unidadFilter.value;
  if(!unidad) return alert("Seleccione una Unidad Responsable antes de exportar.");

  // gather items for this unidad (respect current monto & search)
  // We'll reuse current filteredData, but ensure it's filtered by unidad
  const items = mappedData.filter(d => d.unidad === unidad);

  if(items.length === 0){
    return alert("No se encontraron tarifas para la unidad seleccionada.");
  }

  // Create jsPDF instance
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 40;

  // Header (you can later add logo image here using doc.addImage when logo is available)
  // Title
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("UNIVERSIDAD - Tarifario (Reporte)", 40, cursorY);
  cursorY += 18;

  // Unidad line
  doc.setFontSize(12);
  doc.text(`Unidad Responsable: ${unidad}`, 40, cursorY);
  cursorY += 22;

  // Aviso azul (comisiones) — box
  const aviso = "El monto mostrado es referencial. El total a pagar puede incluir comisiones según el canal de pago (Caja UNH, Banco de la Nación, Caja Huancayo, Niubiz, etc.). Cotejar el monto final en la entidad recaudadora.";
  const avisoBoxHeight = 60;
  doc.setFillColor(220,235,250); // light blue
  doc.roundedRect(40, cursorY, pageWidth - 80, avisoBoxHeight, 6, 6, "F");
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(aviso, pageWidth - 100), 50, cursorY + 18);
  cursorY += avisoBoxHeight + 14;

  // Table header + rows via autoTable
  // Prepare table columns
  const tableColumns = [
    { header: "Proceso", dataKey: "proceso" },
    { header: "Tarifa", dataKey: "tarifa" },
    { header: "Monto (S/)", dataKey: "monto" },
    { header: "Área", dataKey: "area" },
    { header: "Origen", dataKey: "origen" }
  ];

  const tableBody = items.map(it => ({
    proceso: it.proceso || "—",
    tarifa: it.tarifa || "—",
    monto: (it.monto || 0).toString(),
    area: it.area || "—",
    origen: it.origen || "—"
  }));

  // Use autoTable
  doc.autoTable({
    startY: cursorY,
    head: [tableColumns.map(c => c.header)],
    body: tableBody.map(row => tableColumns.map(c => row[c.dataKey])),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [3,56,102], textColor: 255 },
    margin: { left: 40, right: 40 },
    willDrawCell: (data) => {},
    didDrawPage: (data) => {}
  });

  // After table, add requisitos per item (each item heading + bullets)
  let afterTableY = doc.autoTable.previous ? doc.autoTable.previous.finalY + 16 : doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : doc.internal.pageSize.getHeight() - 40;
  if(afterTableY > doc.internal.pageSize.getHeight() - 120){
    doc.addPage();
    afterTableY = 40;
  }

  doc.setFontSize(12);
  doc.setTextColor(3,56,102);
  doc.text("Requisitos por servicio", 40, afterTableY);
  afterTableY += 16;
  doc.setFontSize(10);
  doc.setTextColor(40,40,40);

  for(const it of items){
    // title line
    const title = `${it.proceso || "—"} — ${it.tarifa || "—"}`;
    const splitted = doc.splitTextToSize(title, doc.internal.pageSize.getWidth() - 80);
    if(afterTableY + 30 > doc.internal.pageSize.getHeight() - 60){
      doc.addPage();
      afterTableY = 40;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text(splitted, 44, afterTableY);
    afterTableY += (splitted.length * 12);

    // requisitos to list
    doc.setFont(undefined, "normal");
    const text = it.requisitos || "No especificado";
    // split into bullets
    let parts = [];
    if(text.includes("\n")) parts = text.split(/\n+/);
    else if(text.includes(";")) parts = text.split(/\s*;\s*/);
    else if(text.includes(".") && text.length > 40) parts = text.split(/\.\s+/).filter(Boolean);
    else parts = [text];

    parts.forEach(p => {
      const bullet = "• " + p.trim();
      const lines = doc.splitTextToSize(bullet, doc.internal.pageSize.getWidth() - 100);
      if(afterTableY + (lines.length * 12) > doc.internal.pageSize.getHeight() - 60){
        doc.addPage();
        afterTableY = 40;
      }
      doc.text(lines, 54, afterTableY);
      afterTableY += lines.length * 12;
    });

    afterTableY += 8;
  }

  // Footer: generated date
  const genDate = new Date().toLocaleString();
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Reporte generado: ${genDate}`, 40, doc.internal.pageSize.getHeight() - 30);

  // Save file
  const filename = `tarifario_${unidad.replace(/\s+/g,"_").toLowerCase()}_${(new Date()).toISOString().slice(0,10)}.pdf`;
  doc.save(filename);
}

// export button handler
exportPdfBtn.addEventListener("click", exportFilteredUnitPDF);

// start loading CSV
if(!CSV_URL){
  statusEl.textContent = "No se ha configurado la URL del CSV.";
} else {
  loadCSV(CSV_URL);
}

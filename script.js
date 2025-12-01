/* script.js
   - PapaParse CSV parsing
   - Fuse.js fuzzy search (si está disponible)
   - doble slider para monto (minMonto / maxMonto)
   - paginación (21 por página)
   - modal con requisitos + unidad + area + contactos
   - select de canales (Opción A) y cálculo de comisiones
   - export PDF por Unidad (landscape A4)
*/

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSvu5g5Ubgccjk_GafzxPj7J1WQYvlFLWD4OURUQQ8BgTKREDec4R5aXNRoqOgU9avsFvggsWfafWyS/pub?gid=1276577330&single=true&output=csv";

// DOM
const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const cardsContainer = document.getElementById("cardsContainer");
const statusEl = document.getElementById("status");
const paginationEl = document.getElementById("pagination");

const minMontoInput = document.getElementById("minMonto");
const maxMontoInput = document.getElementById("maxMonto");
const minMontoValue = document.getElementById("minMontoValue");
const maxMontoValue = document.getElementById("maxMontoValue");

const exportPdfBtn = document.getElementById("exportPdfBtn");

// Modal elements
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalUnidad = document.getElementById("modalUnidad");
const modalArea = document.getElementById("modalArea");
const modalCorreo = document.getElementById("modalCorreo");
const modalTelefono = document.getElementById("modalTelefono");
const modalRequisitos = document.getElementById("modalRequisitos");
const modalCloseBtn = document.getElementById("modalClose");

const paymentSelect = document.getElementById("paymentSelect");
const estimatedRow = document.getElementById("estimatedRow");
const estimatedTotal = document.getElementById("estimatedTotal");

// State
let rawData = [];
let mappedData = [];
let fuse = null;
let filteredData = [];
let pageSize = 21;
let currentPage = 1;

// UTIL
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
  out.unidad = normalized["centro de costo"] || normalized["unidad responsable"] || normalized["centro de costo (unidad de organizacion encargada de brindar el servicio)"] || "";
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
    console.error("PapaParse no encontrado.");
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
      // set up Fuse if available
      if(typeof Fuse !== "undefined"){
        fuse = new Fuse(mappedData, {
          keys: [
            { name: "tarifa", weight: 0.9 },
            { name: "proceso", weight: 0.85 },
            { name: "unidad", weight: 0.7 },
            { name: "area", weight: 0.5 }
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

// Init monto slider bounds
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

// Populate unidad filter
function populateFilters(){
  const unidades = Array.from(new Set(mappedData.map(r => r.unidad).filter(Boolean))).sort();
  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
  unidades.forEach(u => {
    const o = document.createElement("option");
    o.value = u; o.textContent = u;
    unidadFilter.appendChild(o);
  });

  unidadFilter.onchange = () => {
    // toggle export button
    exportPdfBtn.disabled = !unidadFilter.value;
    currentPage = 1;
    applyAllFilters();
  };

  exportPdfBtn.addEventListener("click", () => exportUnitPDF());
}

// Apply all filters + search + monto + ordering
function applyAllFilters(){
  const q = (searchInput.value || "").trim();
  const unidad = unidadFilter.value;
  const minV = Math.min(Number(minMontoInput.value), Number(maxMontoInput.value));
  const maxV = Math.max(Number(minMontoInput.value), Number(maxMontoInput.value));

  let results = mappedData.slice();

  // fuzzy search
  if(q.length >= 2 && fuse){
    const fuseRes = fuse.search(q);
    results = fuseRes.map(r => r.item);
  } else if(q.length >= 2) {
    const ql = q.toLowerCase();
    results = results.filter(r =>
      (r.tarifa || "").toLowerCase().includes(ql) ||
      (r.proceso || "").toLowerCase().includes(ql) ||
      (r.unidad || "").toLowerCase().includes(ql) ||
      (r.area || "").toLowerCase().includes(ql)
    );
  }

  // unidad filter
  if(unidad) results = results.filter(r => r.unidad === unidad);

  // monto filter
  results = results.filter(r => (r.monto || 0) >= minV && (r.monto || 0) <= maxV);

  // Order: TUPA first
  results.sort((a,b) => {
    const ao = (a.origen || "").toString().toLowerCase();
    const bo = (b.origen || "").toString().toLowerCase();
    if(ao === "tupa" && bo !== "tupa") return -1;
    if(ao !== "tupa" && bo === "tupa") return 1;
    return 0;
  });

  filteredData = results;
  renderPage(1);
}

// Pagination & rendering
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
      <div class="tag-origen">Origen: ${escapeHTML(item.origen || "")}</div>
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
    reqBtn.addEventListener("click", () => {
      const it = JSON.parse(decodeURIComponent(reqBtn.getAttribute("data-item")));
      openModal(it);
    });

    cardsContainer.appendChild(div);
  });
}

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

// Modal open/close & populate
function openModal(item){
  modalTitle.textContent = item.tarifa ? `${item.tarifa}` : (item.proceso || "Detalle");

  // reset payment select/estimate
  paymentSelect.value = "";
  estimatedRow.classList.add("hidden");
  estimatedTotal.textContent = "S/ 0.00";

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

  // requisitos -> build list
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

  // show
  modalOverlay.classList.remove("hidden");
  modalOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  // Save current opened item (for calculation)
  modalOverlay.currentItem = item;
}

// Close modal
function closeModal(){
  modalOverlay.classList.add("hidden");
  modalOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  // clear currentItem
  modalOverlay.currentItem = null;
}

// Calculation for payment channels
function calculateEstimate(item, channel){
  const monto = Number(item.monto || 0);
  let total = monto;
  let note = "";

  switch(channel){
    case "caja_unh":
      if(monto < 20){
        note = "Caja UNH aplica desde S/20. Consulte a la entidad recaudadora.";
        total = null;
      } else {
        total = monto + 1.00;
      }
      break;

    case "bn_small":
      total = monto + 1.80;
      break;

    case "bn_large":
      total = monto + (monto * 0.0125);
      break;

    case "caja_huancayo":
      total = monto + 1.00;
      break;

    case "niubiz":
      total = monto + (monto * 0.058);
      break;

    default:
      total = null;
  }

  return { total: total === null ? null : Number(total.toFixed(2)), note };
}

// Payment select change -> show estimate
paymentSelect.addEventListener("change", () => {
  const it = modalOverlay.currentItem || null;
  if(!it) return;

  const channel = paymentSelect.value;
  if(!channel){
    estimatedRow.classList.add("hidden");
    estimatedTotal.textContent = "S/ 0.00";
    return;
  }

  const res = calculateEstimate(it, channel);
  if(res.total === null){
    estimatedRow.classList.remove("hidden");
    estimatedTotal.textContent = res.note;
  } else {
    estimatedRow.classList.remove("hidden");
    estimatedTotal.textContent = `S/ ${res.total.toFixed(2)}`;
  }
});

// Event listeners for modal close
if(modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", (e) => { if(e.key === "Escape") closeModal(); });

// Search and inputs
searchInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

// Slider listeners already attached in initMontoRange

// Export PDF for selected unidad (landscape A4)
function exportUnitPDF(){
  const unidad = unidadFilter.value;
  if(!unidad){
    alert("Selecciona una Unidad Responsable para exportar el PDF.");
    return;
  }

  // Filter mappedData for unidad and vigentes (filtered by nothing else)
  const rows = mappedData.filter(r => r.unidad === unidad);

  if(!rows.length){
    alert("No se encontraron registros para la unidad seleccionada.");
    return;
  }

  // Prepare table rows: Proceso | Tarifa | Monto | Unidad | Requisitos
  const doc = new jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const headerText = [
    "UNIVERSIDAD NACIONAL DE HUANCAVELICA - Tarifario (Reporte)",
    `Unidad Responsable: ${unidad}`,
    "El monto mostrado es referencial. El total a pagar puede incluir comisiones adicionales según el canal de pago (Caja UNH, Banco de la Nación, Caja Huancayo, Niubiz, etc.). Cotejar el monto final en la entidad recaudadora."
  ];

  let y = 20;
  doc.setFontSize(12);
  doc.setTextColor(0, 51, 102);
  doc.setFont(undefined, "bold");
  doc.text(headerText[0], 40, y);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  y += 18;
  doc.text(headerText[1], 40, y);
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(headerText[2], 40, y);

  // autoTable data
  const tableColumns = [
    { header: "Proceso", dataKey: "proceso" },
    { header: "Tarifa", dataKey: "tarifa" },
    { header: "Monto (S/)", dataKey: "monto" },
    { header: "Unidad", dataKey: "unidad" },
    { header: "Requisitos", dataKey: "requisitos" }
  ];

  const tableData = rows.map(r => ({
    proceso: r.proceso || "-",
    tarifa: r.tarifa || "-",
    monto: (r.monto || 0).toFixed(2),
    unidad: r.unidad || "-",
    requisitos: (r.requisitos || "-").replace(/\n/g, " ; ")
  }));

  doc.autoTable({
    startY: y + 12,
    head: [tableColumns.map(c => c.header)],
    body: tableData.map(row => tableColumns.map(c => row[c.dataKey])),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [0, 51, 102], textColor: 255, halign: 'left' },
    columnStyles: {
      4: { cellWidth: 240 } // make Requisitos column wide
    },
    margin: { left: 40, right: 40 }
  });

  // Save
  const safeName = unidad.replace(/\s+/g, "_").substring(0,40);
  doc.save(`Tarifario_${safeName}.pdf`);
}

// Initialize
if(!CSV_URL){
  statusEl.textContent = "No se ha configurado la URL del CSV.";
} else {
  loadCSV(CSV_URL);
}

// Additional handlers
minMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });
maxMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });


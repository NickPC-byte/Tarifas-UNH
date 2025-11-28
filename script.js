/* Advanced widget script:
   - PapaParse CSV parsing
   - Fuse.js fuzzy search
   - double-range slider for monto
   - pagination (21 per page)
   - modal with requisitos + unidad + area + contactos
   - TUPA-first ordering
*/

const CSV_URL = typeof SHEET_CSV_URL !== "undefined" ? SHEET_CSV_URL : "";

const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const procesoFilter = document.getElementById("procesoFilter");
const cardsContainer = document.getElementById("cards");
const statusEl = document.getElementById("status");
const paginationEl = document.getElementById("pagination");

const minSlider = document.getElementById("minSlider");
const maxSlider = document.getElementById("maxSlider");
const minValueEl = document.getElementById("minValue");
const maxValueEl = document.getElementById("maxValue");

// Modal elements
const modalOverlay = document.getElementById("modalOverlay");
const modalBody = document.getElementById("modalBody");
const modalUnidad = document.getElementById("modalUnidad");
const modalArea = document.getElementById("modalArea");
const modalCorreo = document.getElementById("modalCorreo");
const modalWhats = document.getElementById("modalWhats");
const modalClose = document.getElementById("modalClose");

let rawData = [];       // mapped rows
let fuse = null;
let pageSize = 21;      // 21 cards / page
let currentPage = 1;
let filteredData = [];
let montoMin = 0, montoMax = 0;

// Util: normalize header keys
function keyify(s){ return s ? s.toString().trim().toLowerCase().replace(/\s+/g," ") : ""; }

// Parse monto to number (strip currency text)
function parseMonto(v){
  if(!v) return 0;
  // Remove non-digit, non-dot, non-comma. Replace comma with dot if necessary
  let s = v.toString().replace(/\s/g, "");
  s = s.replace(/S\/|s\/|soles|sol|S/gi, "");
  s = s.replace(/\./g, function(m, idx, str){
    // Heuristic: if there are more than one dot, keep last as decimal - but simpler: remove thousand separators (.) and keep last dot if any
    return ".";
  });
  // Replace commas with dot if there is no dot
  s = s.replace(/,/g, ".");
  // Remove any character except digits and dot
  s = s.replace(/[^0-9.]/g,"");
  // If multiple dots, keep last
  const parts = s.split(".");
  if(parts.length>2){
    const dec = parts.pop();
    s = parts.join("") + "." + dec;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Map CSV row object to our model (robust to header names)
function mapRow(row){
  const mapped = {};
  const normalized = {};
  Object.keys(row).forEach(k => normalized[keyify(k)] = row[k]);

  mapped.origen = (normalized["tupa/tusne"] || normalized["tupa/tusne (origen de la tarifa)"] || normalized["origen"] || normalized["tupa tusne"] || "").toString().trim();
  mapped.unidad = (normalized["centro de costo"] || normalized["unidad responsable"] || normalized["centro de costo (unidad de organizacion encargada de brindar el servicio)"] || "").toString().trim();
  mapped.cxc = (normalized["cxc"] || normalized["cxc: abreviatura del centro de costo"] || "").toString().trim();
  mapped.area = (normalized["área responsable de brindar el servicio"] || normalized["area responsable de brindar el servicio"] || normalized["area"] || mapped.unidad).toString().trim();
  mapped.proceso = (normalized["proceso"] || "").toString().trim();
  mapped.tarifa = (normalized["tarifas"] || normalized["tarifa"] || normalized["denominación de la tarifa"] || "").toString().trim();
  mapped.montoRaw = (normalized["monto"] || "").toString().trim();
  mapped.monto = parseMonto(mapped.montoRaw);
  mapped.requisitos = (normalized["requisitos generales"] || normalized["requisitos"] || "").toString().trim();
  mapped.correo = (normalized["correo"] || "").toString().trim();
  mapped.celular = (normalized["n° celular"] || normalized["numero celular"] || normalized["celular"] || "").toString().replace(/\s/g,"").trim();

  return mapped;
}

// Load CSV via PapaParse
function loadCSV(url){
  statusEl.textContent = "Cargando datos desde Google Sheets...";
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: results => {
      rawData = results.data.map(r => mapRow(r)).filter(r => r && (r.tarifa || r.proceso));
      if(rawData.length === 0){
        statusEl.textContent = "No se encontraron registros en la hoja.";
        return;
      }
      initMontoRange();
      initFuse();
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

// Init Fuse for fuzzy search
function initFuse(){
  fuse = new Fuse(rawData, {
    keys: [
      { name: "tarifa", weight: 0.9 },
      { name: "proceso", weight: 0.8 },
      { name: "unidad", weight: 0.7 },
      { name: "area", weight: 0.5 }
    ],
    threshold: 0.35
  });
}

// Populate select filters
function populateFilters(){
  const unidades = Array.from(new Set(rawData.map(r => r.unidad).filter(Boolean))).sort();
  const procesos = Array.from(new Set(rawData.map(r => r.proceso).filter(Boolean))).sort();

  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
  procesoFilter.innerHTML = `<option value="">Proceso</option>`;

  unidades.forEach(u => {
    const o = document.createElement("option"); o.value = u; o.textContent = u;
    unidadFilter.appendChild(o);
  });
  procesos.forEach(p => {
    const o = document.createElement("option"); o.value = p; o.textContent = p;
    procesoFilter.appendChild(o);
  });

  unidadFilter.onchange = () => { currentPage = 1; applyAllFilters(); };
  procesoFilter.onchange = () => { currentPage = 1; applyAllFilters(); };
}

// Initialize monto slider bounds
function initMontoRange(){
  const montos = rawData.map(r => r.monto || 0);
  montoMin = Math.min(...montos);
  montoMax = Math.max(...montos);

  // Round bounds nicely
  const step = montoMax > 100 ? 1 : 0.01;
  const pad = Math.max(1, Math.round(montoMax * 0.02));

  const low = Math.max(0, Math.floor(montoMin) - pad);
  const high = Math.ceil(montoMax) + pad;

  minSlider.min = low;
  minSlider.max = high;
  maxSlider.min = low;
  maxSlider.max = high;

  minSlider.value = low;
  maxSlider.value = high;

  minValueEl.textContent = low;
  maxValueEl.textContent = high;

  // Event listeners
  minSlider.addEventListener("input", onSliderChange);
  maxSlider.addEventListener("input", onSliderChange);
}

function onSliderChange(){
  let minV = Number(minSlider.value);
  let maxV = Number(maxSlider.value);
  if(minV > maxV){
    // swap to keep logical order
    [minV, maxV] = [maxV, minV];
  }
  minValueEl.textContent = minV.toFixed(2).replace(/\.00$/,"");
  maxValueEl.textContent = maxV.toFixed(2).replace(/\.00$/,"");
  currentPage = 1;
  applyAllFilters();
}

// Apply search + filters + monto + ordering and then pagination
function applyAllFilters(){
  const q = searchInput.value.trim();
  const unidad = unidadFilter.value;
  const proceso = procesoFilter.value;
  const minV = Math.min(Number(minSlider.value), Number(maxSlider.value));
  const maxV = Math.max(Number(minSlider.value), Number(maxSlider.value));

  // start with all
  let results = rawData.slice();

  // fuzzy search
  if(q.length >= 2 && fuse){
    const fuseRes = fuse.search(q);
    results = fuseRes.map(r => r.item);
  }

  // filters
  if(unidad) results = results.filter(r => r.unidad === unidad);
  if(proceso) results = results.filter(r => r.proceso === proceso);

  // monto filter
  results = results.filter(r => (r.monto || 0) >= minV && (r.monto || 0) <= maxV);

  // Order TUPA first
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

// RENDER pagination & page
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
  // scroll to top of cards
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
      <div class="card-title">${escapeHTML(item.tarifa || "—")}</div>

      <div class="meta"><strong>Monto:</strong> S/ ${escapeHTML(montoDisplay)}</div>
      <div class="meta"><strong>Proceso:</strong> ${escapeHTML(item.proceso || "—")}</div>
      <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad || "—")}</div>
      <div class="meta"><strong>Área:</strong> ${escapeHTML(item.area || "—")}</div>

      <div class="actions">
        <button class="btn btn-requisitos" data-item='${encodeURIComponent(JSON.stringify(item))}'><i class="bi bi-info-circle"></i> Requisitos</button>
        <a class="btn btn-mail" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.correo || "")}" target="_blank" rel="noopener noreferrer"><i class="bi bi-envelope-fill"></i> Correo</a>
        <a class="btn btn-ws" href="https://wa.me/51${encodeURIComponent((item.celular||"").replace(/\D/g,""))}" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp"></i> WhatsApp</a>
      </div>
    `;

    // attach listener for modal
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

  const createBtn = (txt, disabled=false, cls="") => {
    const b = document.createElement("button");
    b.className = `page-btn ${cls}`; b.textContent = txt;
    if(disabled) b.disabled = true;
    return b;
  };

  // First / Prev
  const first = createBtn("«");
  first.onclick = () => renderPage(1);
  paginationEl.appendChild(first);

  const prev = createBtn("‹");
  prev.onclick = () => renderPage(Math.max(1, current-1));
  paginationEl.appendChild(prev);

  // Pages: show window
  const maxButtons = 7;
  let start = Math.max(1, current - Math.floor(maxButtons/2));
  let end = Math.min(totalPages, start + maxButtons - 1);
  if(end - start < maxButtons -1){
    start = Math.max(1, end - maxButtons + 1);
  }

  for(let p = start; p<=end; p++){
    const b = createBtn(p, false, p===current ? "active" : "");
    b.onclick = () => renderPage(p);
    paginationEl.appendChild(b);
  }

  // Next / Last
  const next = createBtn("›"); next.onclick = () => renderPage(Math.min(totalPages, current+1));
  paginationEl.appendChild(next);

  const last = createBtn("»"); last.onclick = () => renderPage(totalPages);
  paginationEl.appendChild(last);
}

// Modal open/close
function openModal(item){
  // Format requisitos into bullets (split by newline or ; or .-)
  let text = item.requisitos || "No especificado";
  // Normalize separators
  let parts = [];
  if(text.indexOf("\n") >= 0) parts = text.split(/\n+/);
  else if(text.indexOf(";") >= 0) parts = text.split(/\s*;\s*/);
  else if(text.indexOf(".") >= 0 && text.length > 40) parts = text.split(/\.\s+/).filter(Boolean);
  else parts = [text];

  // Build HTML list
  const ul = document.createElement("ul");
  ul.style.margin = "8px 0 12px 16px";
  parts.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.trim();
    ul.appendChild(li);
  });

  modalBody.innerHTML = "";
  modalBody.appendChild(ul);

  modalUnidad.textContent = item.unidad || "—";
  modalArea.textContent = item.area || "—";
  modalCorreo.href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.correo || "")}`;
  modalWhats.href = `https://wa.me/51${encodeURIComponent((item.celular||"").replace(/\D/g,""))}`;

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal(){
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay) closeModal(); });

// Escape HTML
function escapeHTML(s){
  if(!s) return "";
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

// Visible handlers
searchInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

// initialize
if(!CSV_URL){
  statusEl.textContent = "No se ha configurado la URL CSV. Revisa config.";
} else {
  loadCSV(CSV_URL);
}

/* script.js corregido para los últimos IDs del HTML
   - PapaParse CSV parsing
   - Fuse.js fuzzy search
   - doble slider para monto
   - paginación
   - modal con requisitos + unidad + área + contactos
   - orden: TUPA primero
*/

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSvu5g5Ubgccjk_GafzxPj7J1WQYvlFLWD4OURUQQ8BgTKREDec4R5aXNRoqOgU9avsFvggsWfafWyS/pub?gid=1276577330&single=true&output=csv";

// Elementos del DOM
const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const procesoFilter = document.getElementById("procesoFilter");
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

// ❗CORRECCIÓN IMPORTANTE: ahora detectamos el botón por clase (no por ID)
const modalCloseBtn = document.querySelector(".modal-close");

// Data
let rawData = [];
let mappedData = [];
let fuse = null;
let filteredData = [];
let pageSize = 21;
let currentPage = 1;

// UTILIDADES
function keyify(s) {
    return s ? s.toString().trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function parseMonto(v) {
    if (!v) return 0;
    let s = v.toString().trim();
    s = s.replace(/S\/|s\/|soles|sol/gi, "");
    s = s.replace(/\s/g, "");
    s = s.replace(/,/g, ".");
    s = s.replace(/[^0-9.]/g, "");
    const parts = s.split(".");
    if (parts.length > 2) {
        const dec = parts.pop();
        s = parts.join("") + "." + dec;
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

function escapeHTML(s) {
    if (!s) return "";
    return s.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
}

// Mapear fila CSV
function mapRow(row) {
    const normalized = {};
    Object.keys(row || {}).forEach(k => normalized[keyify(k)] = (row[k] || "").toString().trim());

    const out = {};
    out.origen = normalized["tupa/tusne"] || "";
    out.unidad = normalized["centro de costo"] || normalized["unidad responsable"] || "";
    out.cxc = normalized["cxc"] || "";
    out.area = normalized["área responsable de brindar el servicio"] || normalized["area"] || out.unidad;
    out.proceso = normalized["proceso"] || "";
    out.tarifa = normalized["tarifa"] || normalized["denominación de la tarifa"] || "";
    out.montoRaw = normalized["monto"] || "";
    out.monto = parseMonto(out.montoRaw);
    out.requisitos = normalized["requisitos"] || "";
    out.correo = normalized["correo"] || "";
    out.celular = (normalized["n° celular"] || normalized["celular"] || "").replace(/\s/g, "");

    return out;
}

// CARGA CSV
function loadCSV(url) {
    statusEl.textContent = "Cargando datos...";
    if (typeof Papa === "undefined") {
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

            if (mappedData.length === 0) {
                statusEl.textContent = "No se encontraron registros.";
                return;
            }

            if (typeof Fuse !== "undefined") {
                fuse = new Fuse(mappedData, {
                    keys: [
                        { name: "proceso", weight: 0.9 },
                        { name: "tarifa", weight: 0.8 },
                        { name: "unidad", weight: 0.7 },
                        { name: "area", weight: 0.5 }
                    ],
                    threshold: 0.35
                });
            }

            initMontoRange();
            populateFilters();
            applyAllFilters();

            statusEl.classList.add("hidden");
        },
        error: err => {
            console.error("PapaParse error:", err);
            statusEl.textContent = "Error cargando datos.";
        }
    });
}

// Rango del slider
function initMontoRange() {
    const montos = mappedData.map(r => r.monto || 0);
    const min = Math.min(...montos);
    const max = Math.max(...montos);

    minMontoInput.min = min;
    maxMontoInput.max = max;

    minMontoInput.value = min;
    maxMontoInput.value = max;

    minMontoValue.textContent = min;
    maxMontoValue.textContent = max;

    minMontoInput.addEventListener("input", onSliderChange);
    maxMontoInput.addEventListener("input", onSliderChange);
}

function onSliderChange() {
    let a = Number(minMontoInput.value);
    let b = Number(maxMontoInput.value);
    if (a > b) [a, b] = [b, a];

    minMontoValue.textContent = a;
    maxMontoValue.textContent = b;

    currentPage = 1;
    applyAllFilters();
}

// Filtros
function populateFilters() {
    const unidades = Array.from(new Set(mappedData.map(d => d.unidad))).filter(Boolean).sort();
    const procesos = Array.from(new Set(mappedData.map(d => d.proceso))).filter(Boolean).sort();

    unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
    procesoFilter.innerHTML = `<option value="">Proceso</option>`;

    unidades.forEach(u => {
        unidadFilter.innerHTML += `<option value="${u}">${u}</option>`;
    });

    procesos.forEach(p => {
        procesoFilter.innerHTML += `<option value="${p}">${p}</option>`;
    });

    unidadFilter.onchange = () => { currentPage = 1; applyAllFilters(); };
    procesoFilter.onchange = () => { currentPage = 1; applyAllFilters(); };
}

// APLICAR FILTROS
function applyAllFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const unidad = unidadFilter.value;
    const proceso = procesoFilter.value;

    let results = mappedData.slice();

    if (q.length >= 2 && fuse) {
        results = fuse.search(q).map(r => r.item);
    } else if (q.length >= 2) {
        results = results.filter(r =>
            r.proceso.toLowerCase().includes(q) ||
            r.tarifa.toLowerCase().includes(q) ||
            r.unidad.toLowerCase().includes(q)
        );
    }

    if (unidad) results = results.filter(r => r.unidad === unidad);
    if (proceso) results = results.filter(r => r.proceso === proceso);

    const minV = Number(minMontoInput.value);
    const maxV = Number(maxMontoInput.value);
    results = results.filter(r => r.monto >= minV && r.monto <= maxV);

    results.sort((a,b) => {
        if (a.origen === "TUPA" && b.origen !== "TUPA") return -1;
        if (a.origen !== "TUPA" && b.origen === "TUPA") return 1;
        return 0;
    });

    filteredData = results;
    renderPage(1);
}

// Render Cards
function renderCards(items) {
    cardsContainer.innerHTML = "";

    if (!items.length) {
        cardsContainer.innerHTML = `<div class="status">No se encontraron resultados.</div>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "card";

        div.innerHTML = `
            <div class="tag-origen">${escapeHTML(item.origen)}</div>

            <div class="card-title">${escapeHTML(item.proceso)}</div>
            <div class="meta"><strong>Tarifa:</strong> ${escapeHTML(item.tarifa)}</div>
            <div class="meta"><strong>Monto:</strong> S/ ${item.monto}</div>
            <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad)}</div>
            <div class="meta"><strong>Área:</strong> ${escapeHTML(item.area)}</div>

            <div class="actions">
                <button class="btn btn-requisitos">
                    <i class="bi bi-list-check"></i> Requisitos
                </button>

                <a class="btn btn-mail"
                   href="https://mail.google.com/mail/?view=cm&fs=1&to=${item.correo}"
                   target="_blank">
                   <i class="bi bi-envelope-fill"></i> Correo
                </a>

                <a class="btn btn-ws"
                   href="https://wa.me/51${item.celular}"
                   target="_blank">
                   <i class="bi bi-whatsapp"></i> WhatsApp
                </a>
            </div>
        `;

        div.querySelector(".btn-requisitos").onclick = () => openModal(item);

        cardsContainer.appendChild(div);
    });
}

// Paginación
function renderPagination(totalPages, current) {
    paginationEl.innerHTML = "";
    if (totalPages <= 1) return;

    const mk = (txt, page) => {
        const b = document.createElement("button");
        b.className = page === current ? "page-btn active" : "page-btn";
        b.textContent = txt;
        b.onclick = () => renderPage(page);
        return b;
    };

    // First + Prev
    paginationEl.appendChild(mk("«", 1));
    paginationEl.appendChild(mk("‹", Math.max(1, current - 1)));

    const max = Math.min(totalPages, 7);
    for (let p = 1; p <= max; p++) {
        paginationEl.appendChild(mk(p, p));
    }

    // Next + Last
    paginationEl.appendChild(mk("›", Math.min(totalPages, current + 1)));
    paginationEl.appendChild(mk("»", totalPages));
}

function renderPage(page) {
    const total = filteredData.length;
    const totalPages = Math.ceil(total / pageSize);

    page = Math.max(1, Math.min(page, totalPages));

    const start = (page - 1) * pageSize;
    const items = filteredData.slice(start, start + pageSize);

    renderCards(items);
    renderPagination(totalPages, page);
}

// MODAL
function openModal(item){

  // Título del modal (tarifa/proceso)
  modalTitle.textContent = item.proceso || item.tarifa || "Detalle";

  // META INFORMATIVA (con íconos)
  modalUnidad.innerHTML = `<i class="bi bi-building"></i> ${escapeHTML(item.unidad || "—")}`;
  modalArea.innerHTML = `<i class="bi bi-diagram-3"></i> ${escapeHTML(item.area || "—")}`;

  // Correo con enlace clicable
  if(item.correo){
    modalCorreo.innerHTML =
      `<i class="bi bi-envelope"></i> 
       <a href="mailto:${item.correo}" target="_blank">${item.correo}</a>`;
  } else {
    modalCorreo.innerHTML = `<i class="bi bi-envelope"></i> —`;
  }

  // Teléfono con link hacia WhatsApp
  const cel = (item.celular || "").replace(/\D/g,"");

  if(cel){
    modalTelefono.innerHTML =
      `<i class="bi bi-telephone"></i> 
       <a href="https://wa.me/51${cel}" target="_blank">${cel}</a>`;
  } else {
    modalTelefono.innerHTML = `<i class="bi bi-telephone"></i> —`;
  }

  // ===============================
  //   REQUISITOS CON VIÑETAS
  // ===============================
  let text = item.requisitos || "No especificado";
  let parts = [];

  if(text.includes("\n")) parts = text.split(/\n+/);
  else if(text.includes(";")) parts = text.split(/\s*;\s*/);
  else if(text.includes(".") && text.length > 40) parts = text.split(/\.\s+/);
  else parts = [text];

  modalRequisitos.innerHTML = "";
  const ul = document.createElement("ul");

  parts.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.trim();
    ul.appendChild(li);
  });

  modalRequisitos.appendChild(ul);

  // Mostrar modal
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}


function closeModal(){
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// Eventos de cierre
modalOverlay.addEventListener("click", e => {
    if (e.target === modalOverlay) closeModal();
});

if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
}

// Event Listeners
searchInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });
minMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });
maxMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

// INIT
loadCSV(CSV_URL);

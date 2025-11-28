/* ============================================================
   Script avanzado — Tarifario TUPA/TUSNE
   Incluye:
   - PapaParse (CSV)
   - Fuse.js (búsqueda difusa)
   - Cards con PROCESO como título
   - Modal elegante con requisitos + unidad + área + contacto
   - Paginación (21 por página)
   - Filtro por monto (slider doble)
   - Orden TUPA primero
   ============================================================ */

/* ========= CONFIG ========= */
const CSV_URL = typeof SHEET_CSV_URL !== "undefined" ? SHEET_CSV_URL : "";

/* ========= ELEMENTOS ========= */
const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const procesoFilter = document.getElementById("procesoFilter");

const minMonto = document.getElementById("minMonto");
const maxMonto = document.getElementById("maxMonto");
const minMontoValue = document.getElementById("minMontoValue");
const maxMontoValue = document.getElementById("maxMontoValue");

const cardsContainer = document.getElementById("cardsContainer");
const statusEl = document.getElementById("status");
const paginationEl = document.getElementById("pagination");

// Modal
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalUnidad = document.getElementById("modalUnidad");
const modalArea = document.getElementById("modalArea");
const modalCorreo = document.getElementById("modalCorreo");
const modalTelefono = document.getElementById("modalTelefono");
const modalRequisitos = document.getElementById("modalRequisitos");

let rawData = [];
let filteredData = [];
let fuse;
let currentPage = 1;
const pageSize = 21;

/* ========= UTILIDADES ========= */
function keyify(s) {
    return s ? s.toString().trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function escapeHTML(s) {
    if (!s) return "";
    return s.replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[m]));
}

function parseMonto(v) {
    if (!v) return 0;
    let s = v.toString().replace(/\s/g, "");
    s = s.replace(/S\/|s\/|soles|sol/gi, "");
    s = s.replace(/,/g, ".");
    s = s.replace(/[^0-9.]/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

/* ========= MAPEO DE FILAS ========= */
function mapRow(row) {
    const n = {};
    Object.keys(row).forEach(k => n[keyify(k)] = row[k]);

    return {
        origen: (n["tupa/tusne"] || n["origen"] || "").trim(),
        unidad: (n["centro de costo"] || n["unidad responsable"] || "").trim(),
        area: (n["área responsable de brindar el servicio"] || n["area"] || "").trim(),
        proceso: (n["proceso"] || "").trim(),
        tarifa: (n["tarifa"] || n["tarifas"] || "").trim(),
        montoRaw: (n["monto"] || "").trim(),
        monto: parseMonto(n["monto"]),
        requisitos: (n["requisitos"] || "").trim(),
        correo: (n["correo"] || "").trim(),
        celular: (n["n° celular"] || n["celular"] || "").trim()
    };
}

/* ========= CARGAR CSV ========= */
function loadCSV() {
    if (!CSV_URL) {
        statusEl.textContent = "No se ha configurado la URL CSV.";
        return;
    }

    statusEl.textContent = "Cargando datos...";

    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: res => {
            rawData = res.data.map(r => mapRow(r))
                .filter(r => r.proceso || r.tarifa);

            if (!rawData.length) {
                statusEl.textContent = "No se encontraron registros.";
                return;
            }

            initFuse();
            initFilters();
            initMontoRange();
            applyFilters();
            statusEl.classList.add("hidden");
        },
        error: err => {
            console.error(err);
            statusEl.textContent = "Error cargando CSV.";
        }
    });
}

/* ========= FUSE (BÚSQUEDA DIFUSA) ========= */
function initFuse() {
    fuse = new Fuse(rawData, {
        keys: [
            { name: "proceso", weight: 0.9 },
            { name: "tarifa", weight: 0.8 },
            { name: "unidad", weight: 0.6 },
            { name: "area", weight: 0.4 }
        ],
        threshold: 0.35
    });
}

/* ========= FILTROS ========= */
function initFilters() {
    const unidades = [...new Set(rawData.map(r => r.unidad).filter(Boolean))].sort();
    const procesos = [...new Set(rawData.map(r => r.proceso).filter(Boolean))].sort();

    unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
    procesoFilter.innerHTML = `<option value="">Proceso</option>`;

    unidades.forEach(u => unidadFilter.innerHTML += `<option>${u}</option>`);
    procesos.forEach(p => procesoFilter.innerHTML += `<option>${p}</option>`);

    unidadFilter.onchange = () => { currentPage = 1; applyFilters(); };
    procesoFilter.onchange = () => { currentPage = 1; applyFilters(); };
}

/* ========= SLIDER DE MONTO ========= */
function initMontoRange() {
    const valores = rawData.map(r => r.monto);
    const min = Math.min(...valores);
    const max = Math.max(...valores);

    minMonto.min = maxMonto.min = Math.floor(min);
    minMonto.max = maxMonto.max = Math.ceil(max);

    minMonto.value = minMonto.min;
    maxMonto.value = maxMonto.max;

    minMontoValue.textContent = minMonto.value;
    maxMontoValue.textContent = maxMonto.value;

    minMonto.oninput = updateMonto;
    maxMonto.oninput = updateMonto;
}

function updateMonto() {
    let v1 = Number(minMonto.value);
    let v2 = Number(maxMonto.value);

    if (v1 > v2) [v1, v2] = [v2, v1];

    minMontoValue.textContent = v1;
    maxMontoValue.textContent = v2;

    applyFilters();
}

/* ========= APLICAR FILTROS ========= */
function applyFilters() {
    let results = rawData.slice();

    // búsqueda
    const q = searchInput.value.trim();
    if (q.length >= 2) {
        results = fuse.search(q).map(r => r.item);
    }

    // unidad
    if (unidadFilter.value)
        results = results.filter(r => r.unidad === unidadFilter.value);

    // proceso
    if (procesoFilter.value)
        results = results.filter(r => r.proceso === procesoFilter.value);

    // monto
    const minV = Number(minMontoValue.textContent);
    const maxV = Number(maxMontoValue.textContent);
    results = results.filter(r => r.monto >= minV && r.monto <= maxV);

    // ordenar TUPA primero
    results.sort((a, b) => {
        if (a.origen === "TUPA" && b.origen !== "TUPA") return -1;
        if (a.origen !== "TUPA" && b.origen === "TUPA") return 1;
        return 0;
    });

    filteredData = results;

    renderPage(1);
}

/* ========= RENDER CARDS ========= */
function renderPage(page) {
    currentPage = page;

    const total = filteredData.length;
    const totalPages = Math.ceil(total / pageSize);

    const start = (page - 1) * pageSize;
    const items = filteredData.slice(start, start + pageSize);

    renderCards(items);
    renderPagination(totalPages, page);
}

function renderCards(items) {
    cardsContainer.innerHTML = "";

    if (!items.length) {
        cardsContainer.innerHTML = `<div class="status">Sin resultados.</div>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "card";

        div.innerHTML = `
            <div class="tag-origen">Origen: ${escapeHTML(item.origen)}</div>
            <div class="card-title">${escapeHTML(item.proceso)}</div>

            <div class="meta"><strong>Tarifa:</strong> ${escapeHTML(item.tarifa)}</div>
            <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad)}</div>
            <div class="meta"><strong>Área:</strong> ${escapeHTML(item.area)}</div>
            <div class="meta"><strong>Monto:</strong> S/ ${escapeHTML(item.montoRaw)}</div>

            <div class="actions">
                <button class="btn btn-requisitos">
                    <i class="bi bi-info-circle"></i> Requisitos
                </button>

                <a class="btn btn-mail" href="mailto:${item.correo}">
                    <i class="bi bi-envelope-fill"></i> Correo
                </a>

                <a class="btn btn-ws" href="https://wa.me/51${item.celular.replace(/\D/g,'')}">
                    <i class="bi bi-whatsapp"></i> WhatsApp
                </a>
            </div>
        `;

        div.querySelector(".btn-requisitos").onclick = () => openModal(item);

        cardsContainer.appendChild(div);
    });
}

/* ========= MODAL ========= */
function openModal(item) {
    modalTitle.textContent = item.proceso || "Detalle";

    // requisitos listados como viñetas
    const reqs = item.requisitos.split(/\n|;|\r/).filter(t => t.trim());

    modalRequisitos.innerHTML = `
        <ul>${reqs.map(r => `<li>${escapeHTML(r)}</li>`).join("")}</ul>
    `;

    modalUnidad.textContent = item.unidad || "—";
    modalArea.textContent = item.area || "—";

    modalCorreo.innerHTML = `<a href="mailto:${item.correo}">${item.correo || "—"}</a>`;
    modalTelefono.innerHTML = `<a href="https://wa.me/51${item.celular.replace(/\D/g,'')}" target="_blank">${item.celular || "—"}</a>`;

    modalOverlay.classList.remove("hidden");
}

function closeModal() {
    modalOverlay.classList.add("hidden");
}

modalOverlay.addEventListener("click", e => {
    if (e.target === modalOverlay) closeModal();
});

/* ========= BUSCADOR ========= */
searchInput.oninput = () => {
    currentPage = 1;
    applyFilters();
};

/* ========= INICIAR ========= */
loadCSV();

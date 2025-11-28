// script.js
// Lee CSV (PapaParse), busca (Fuse.js) y renderiza cards + modal de requisitos

const SEARCH_INPUT = document.getElementById("searchInput");
const UNIDAD_SELECT = document.getElementById("unidadFilter");
const PROCESO_SELECT = document.getElementById("procesoFilter");
const CARDS = document.getElementById("cards");
const STATUS = document.getElementById("status");

const MODAL_OVERLAY = document.getElementById("modalOverlay");
const MODAL_CONTENT = document.getElementById("modalContent");
const MODAL_CLOSE = document.getElementById("modalClose");

let rawData = [];   // array de objetos
let fuse = null;    // instancia Fuse
let fuseOptions = {
  keys: [
    { name: "tarifa", weight: 0.9 },
    { name: "proceso", weight: 0.8 },
    { name: "unidad", weight: 0.8 },
    { name: "area", weight: 0.6 },
    { name: "origen", weight: 0.5 }
  ],
  threshold: 0.35,
  minMatchCharLength: 2
};

// UTIL: normaliza encabezados y campos
function normalizeFieldName(s){
  return s ? s.toString().trim().toLowerCase().replace(/\s+/g," ") : "";
}

// Cargar CSV con PapaParse
function loadDataFromCSV(url){
  STATUS.textContent = "Cargando datos desde Google Sheets...";
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      // results.data es un array de objetos usando headers del CSV
      rawData = results.data.map(row => mapRowToModel(row));
      STATUS.classList.add("hidden");
      initializeSearch();
      populateFilters();
      renderCards(rawData);
    },
    error: (err) => {
      console.error("Error PapaParse:", err);
      STATUS.textContent = "Error cargando datos. Ver consola.";
    }
  });
}

// Mapea cada fila (objeto con keys del CSV) a los campos que usamos
function mapRowToModel(row){
  // Normaliza keys (lowercase trimmed) para encontrar las columnas independientemente de cómo vengan
  const normalized = {};
  Object.keys(row).forEach(k => {
    normalized[normalizeFieldName(k)] = row[k];
  });

  // Buscar por nombres esperados (varias variantes)
  const orCol = normalized["tupa/tusne"] ?? normalized["tupa/tusne (origen de la tarifa)"] ?? normalized["origen"] ?? normalized["tupa tusne"] ?? normalized["tupa"];
  const unidad = normalized["centro de costo"] ?? normalized["unidad responsable"] ?? normalized["centro de costo (unidad de organizacion)"] ?? normalized["unidad"] ?? normalized["centro de costo"] ?? "";
  const cxc = normalized["cxc"] ?? normalized["cxc: abreviatura del centro de costo"] ?? normalized["abreviatura"] ?? "";
  const area = normalized["área responsable de brindar el servicio"] ?? normalized["area responsable de brindar el servicio"] ?? normalized["area"] ?? unidad;
  const proceso = normalized["proceso"] ?? normalized["proceso (proceso del TUPA o TUSNE del cual es parte la tarifa de la fila)"] ?? "";
  const tarifa = normalized["tarifas"] ?? normalized["tarifa"] ?? normalized["denominación de la tarifa"] ?? normalized["denominacion"] ?? "";
  const monto = normalized["monto"] ?? normalized["monto (monto de la tarifa sin incluir las comisiones)"] ?? "";
  const requisitos = normalized["requisitos generales"] ?? normalized["requisitos"] ?? "";
  const correo = normalized["correo"] ?? normalized["correo (correo de la unidad)"] ?? "";
  const celular = normalized["n° celular"] ?? normalized["n° celular (misma funcion)"] ?? normalized["celular"] ?? normalized["telefono"] ?? "";

  return {
    origen: (orCol || "").toString().trim(),
    unidad: (unidad || "").toString().trim(),
    cxc: (cxc || "").toString().trim(),
    area: (area || "").toString().trim(),
    proceso: (proceso || "").toString().trim(),
    tarifa: (tarifa || "").toString().trim(),
    monto: (monto || "").toString().trim(),
    requisitos: (requisitos || "").toString().trim(),
    correo: (correo || "").toString().trim(),
    celular: (celular || "").toString().trim()
  };
}

// Inicializa Fuse
function initializeSearch(){
  fuse = new Fuse(rawData, fuseOptions);
  SEARCH_INPUT.addEventListener("input", onSearchChange);
  UNIDAD_SELECT.addEventListener("change", onFiltersChange);
  PROCESO_SELECT.addEventListener("change", onFiltersChange);
}

// Poblado de filtros dinámicos
function populateFilters(){
  const unidades = Array.from(new Set(rawData.map(r => r.unidad).filter(Boolean))).sort();
  const procesos = Array.from(new Set(rawData.map(r => r.proceso).filter(Boolean))).sort();

  unidades.forEach(u => {
    const o = document.createElement("option"); o.value = u; o.textContent = u;
    UNIDAD_SELECT.appendChild(o);
  });
  procesos.forEach(p => {
    const o = document.createElement("option"); o.value = p; o.textContent = p;
    PROCESO_SELECT.appendChild(o);
  });
}

// Manejo de búsqueda y filtros
function onSearchChange(){
  applyFilters();
}
function onFiltersChange(){
  applyFilters();
}

function applyFilters(){
  const q = SEARCH_INPUT.value.trim();
  const unidadVal = UNIDAD_SELECT.value;
  const procesoVal = PROCESO_SELECT.value;

  let results = rawData;

  // Fuzzy search si hay texto
  if (q.length >= 2){
    const fuseRes = fuse.search(q);
    results = fuseRes.map(r => r.item);
  }

  // filtros exactos
  if (unidadVal){
    results = results.filter(r => r.unidad === unidadVal);
  }
  if (procesoVal){
    results = results.filter(r => r.proceso === procesoVal);
  }

  renderCards(results);
}

// Renderiza tarjetas
function renderCards(items){
  CARDS.innerHTML = "";
  if (!items || items.length === 0){
    CARDS.innerHTML = `<div class="status">No se encontraron resultados.</div>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "card";

    // Construir HTML seguro (escape mínimo)
    const tarifa = escapeHTML(item.tarifa || "—");
    const monto = escapeHTML(item.monto || "—");
    const proceso = escapeHTML(item.proceso || "—");
    const unidad = escapeHTML(item.unidad || "—");
    const area = escapeHTML(item.area || "—");
    const origen = escapeHTML(item.origen || "—");
    const correo = (item.correo || "").trim();
    const celular = (item.celular || "").replace(/\s|\+/g,""); // limpiar
    const requisitos = (item.requisitos || "").trim();

    div.innerHTML = `
      <div class="tag-origen">Origen: ${origen}</div>
      <div class="card-title">${tarifa}</div>

      <div class="meta"><b>Monto:</b> S/ ${monto}</div>
      <div class="meta"><b>Proceso:</b> ${proceso}</div>
      <div class="meta"><b>Unidad:</b> ${unidad}</div>
      <div class="meta"><b>Área:</b> ${area}</div>

      <div class="actions">
        <button class="btn btn-requisitos" data-requisitos="${encodeURIComponent(requisitos)}">🗂 Ver requisitos</button>

        <a class="btn btn-mail" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(correo)}" target="_blank" title="Enviar correo">
          🔵 Enviar correo
        </a>

        <a class="btn btn-green" href="https://wa.me/51${encodeURIComponent(celular)}" target="_blank" title="WhatsApp">
          🟠 WhatsApp
        </a>
      </div>
    `;

    // añadir listeners al botón de requisitos
    const requisitosBtn = div.querySelector(".btn-requisitos");
    requisitosBtn.addEventListener("click", () => {
      const encoded = requisitosBtn.getAttribute("data-requisitos") || "";
      const text = decodeURIComponent(encoded) || "No especificado";
      openModal(text);
    });

    CARDS.appendChild(div);
  });
}

// Modal
function openModal(text){
  MODAL_CONTENT.textContent = text || "No especificado";
  MODAL_OVERLAY.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(){
  MODAL_OVERLAY.classList.add("hidden");
  document.body.style.overflow = "";
}

MODAL_CLOSE.addEventListener("click", closeModal);
MODAL_OVERLAY.addEventListener("click", (e)=>{
  if(e.target === MODAL_OVERLAY) closeModal();
});

// Escape para insertar HTML seguro (básico)
function escapeHTML(str){
  if(!str) return "";
  return str.replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

// inicializar carga
loadDataFromCSV(SHEET_CSV_URL);

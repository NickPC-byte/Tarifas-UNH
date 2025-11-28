/* SCRIPT ACTUALIZADO — MODAL FIJO + PROCESO COMO TÍTULO */

const CSV_URL = SHEET_CSV_URL;

// Elementos
const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const procesoFilter = document.getElementById("procesoFilter");
const cardsContainer = document.getElementById("cardsContainer");
const statusEl = document.getElementById("status");
const paginationEl = document.getElementById("pagination");

// Sliders
const minMonto = document.getElementById("minMonto");
const maxMonto = document.getElementById("maxMonto");
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

let rawData = [];
let fuse;
let filteredData = [];
let pageSize = 21;
let currentPage = 1;

/* UTILIDADES */
function escapeHTML(s){
  return s ? s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  }[c])) : "";
}

function parseMonto(v){
  if(!v) return 0;
  return Number(v.toString().replace(/[^\d.]/g,"")) || 0;
}

/* MAPEO DE FILA CSV */
function mapRow(r){
  return {
    origen: r["TUPA/TUSNE"]?.trim() || "",
    unidad: r["Centro de Costo"]?.trim() || "",
    area: r["Área responsable de brindar el servicio"]?.trim() || r["Centro de Costo"],
    proceso: r["Proceso"]?.trim() || "",
    tarifa: r["Tarifas"]?.trim() || "",
    montoRaw: r["Monto"]?.trim() || "0",
    monto: parseMonto(r["Monto"]),
    requisitos: r["Requisitos generales"]?.trim() || "",
    correo: r["Correo"]?.trim() || "",
    celular: (r["N° Celular"] || "").toString().replace(/\D/g,"")
  };
}

/* CARGA CSV */
Papa.parse(CSV_URL, {
  download:true,
  header:true,
  skipEmptyLines:true,
  complete: res => {
    rawData = res.data.map(mapRow);

    initFuse();
    initFilters();
    initSliderBounds();
    applyAllFilters();
  }
});

/* FUSE PARA BÚSQUEDA */
function initFuse(){
  fuse = new Fuse(rawData,{
    keys:["tarifa","proceso","unidad","area"],
    threshold:0.33
  });
}

/* SELECTS */
function initFilters(){
  const unidades = [...new Set(rawData.map(r=>r.unidad))].sort();
  const procesos = [...new Set(rawData.map(r=>r.proceso))].sort();

  unidades.forEach(u=>{
    const o=document.createElement("option");
    o.value=u; o.textContent=u;
    unidadFilter.appendChild(o);
  });

  procesos.forEach(p=>{
    const o=document.createElement("option");
    o.value=p; o.textContent=p;
    procesoFilter.appendChild(o);
  });

  unidadFilter.onchange = applyAllFilters;
  procesoFilter.onchange = applyAllFilters;
  searchInput.oninput = applyAllFilters;
}

/* SLIDER */
function initSliderBounds(){
  const montos = rawData.map(r=>r.monto);
  const min = Math.min(...montos);
  const max = Math.max(...montos);

  minMonto.min = minMontoValue.textContent = min;
  minMonto.max = maxMonto.max = max;
  maxMonto.min = min;
  maxMonto.value = max;
  maxMontoValue.textContent = max;

  minMonto.oninput = updateSlider;
  maxMonto.oninput = updateSlider;
}

function updateSlider(){
  let v1 = Number(minMonto.value);
  let v2 = Number(maxMonto.value);

  if(v1>v2){ [v1,v2]=[v2,v1]; }

  minMontoValue.textContent = v1;
  maxMontoValue.textContent = v2;

  applyAllFilters();
}

/* APLICAR FILTROS */
function applyAllFilters(){
  let data = rawData.slice();
  let query = searchInput.value.trim();

  if(query.length>=2){
    data = fuse.search(query).map(r=>r.item);
  }

  if(unidadFilter.value){
    data = data.filter(r => r.unidad===unidadFilter.value);
  }
  
  if(procesoFilter.value){
    data = data.filter(r => r.proceso===procesoFilter.value);
  }

  // monto
  const v1 = Number(minMonto.value);
  const v2 = Number(maxMonto.value);
  data = data.filter(r => r.monto >= v1 && r.monto <= v2);

  // Order TUPA primero
  data.sort((a,b)=>{
    if(a.origen==="TUPA" && b.origen!=="TUPA") return -1;
    if(a.origen!=="TUPA" && b.origen==="TUPA") return 1;
    return 0;
  });

  filteredData = data;
  renderPage(1);
}

/* PAGINACIÓN */
function renderPage(p){
  currentPage = p;
  const totalPages = Math.ceil(filteredData.length/pageSize);
  const start = (p-1)*pageSize;
  const items = filteredData.slice(start,start+pageSize);

  renderCards(items);
  renderPagination(totalPages);
}

/* TARJETAS */
function renderCards(items){
  cardsContainer.innerHTML="";

  items.forEach(item=>{
    const card=document.createElement("div");
    card.className="card";

    card.innerHTML = `
      <div class="tag-origen">Origen: ${item.origen}</div>

      <div class="card-title">${escapeHTML(item.proceso)}</div>

      <div class="meta"><strong>Tarifa:</strong> ${escapeHTML(item.tarifa)}</div>
      <div class="meta"><strong>Monto:</strong> S/ ${escapeHTML(item.montoRaw)}</div>
      <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad)}</div>
      <div class="meta"><strong>Área:</strong> ${escapeHTML(item.area)}</div>

      <div class="actions">
        <button class="btn btn-requisitos"><i class="bi bi-info-circle"></i> Requisitos</button>
        <a class="btn btn-mail" target="_blank" href="https://mail.google.com/mail/?view=cm&to=${item.correo}">
          <i class="bi bi-envelope-fill"></i> Correo
        </a>
        <a class="btn btn-ws" target="_blank" href="https://wa.me/51${item.celular}">
          <i class="bi bi-whatsapp"></i> WhatsApp
        </a>
      </div>
    `;

    // abrir modal
    card.querySelector(".btn-requisitos").onclick = () => openModal(item);

    cardsContainer.appendChild(card);
  });
}

/* PAGINACIÓN */
function renderPagination(total){
  paginationEl.innerHTML="";
  if(total<=1) return;

  for(let i=1;i<=total;i++){
    const b=document.createElement("button");
    b.className="page-btn";
    if(i===currentPage) b.classList.add("active");
    b.textContent=i;
    b.onclick=()=>renderPage(i);
    paginationEl.appendChild(b);
  }
}

/* MODAL */
function openModal(item){
  modalTitle.textContent = item.proceso.toUpperCase();

  modalUnidad.textContent = item.unidad;
  modalArea.textContent = item.area;

  modalCorreo.innerHTML = item.correo
    ? `<a href="https://mail.google.com/mail/?view=cm&to=${item.correo}" target="_blank">${item.correo}</a>`
    : "—";

  modalTelefono.innerHTML = item.celular
    ? `<a href="https://wa.me/51${item.celular}" target="_blank">${item.celular}</a>`
    : "—";

  // requisitos → lista
  const reqs = item.requisitos.split(/[\n;]+/).map(r=>r.trim()).filter(Boolean);
  modalRequisitos.innerHTML = "<ul>" + reqs.map(r=>`<li>${escapeHTML(r)}</li>`).join("") + "</ul>";

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow="hidden";
}

function closeModal(){
  modalOverlay.classList.add("hidden");
  document.body.style.overflow="";
}

window.closeModal = closeModal;

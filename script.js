const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSvu5g5Ubgccjk_GafzxPj7J1WQYvlFLWD4OURUQQ8BgTKREDec4R5aXNRoqOgU9avsFvggsWfafWyS/pub?gid=1276577330&single=true&output=csv";

let data = [];
let filtered = [];
let currentPage = 1;
const perPage = 21;

/* Cargar CSV */
fetch(CSV_URL)
  .then(res => res.text())
  .then(csv => {
      data = Papa.parse(csv, { header:true }).data.map(x => ({
          origen: x["TUPA/TUSNE"],
          unidad_responsable: x["Centro de Costo"],
          cxc: x["CxC"],
          área: x["Área responsable de brindar el servicio"],
          proceso: x["Proceso"],
          tarifa: x["Tarifas"],
          monto: Number(x["Monto"] || 0),
          requisitos: x["Requisitos generales"],
          correo: x["Correo"],
          telefono: x["N° Celular"]
      }));

      buildFilters();
      applyFilters();
  });

/* Construir selects */
function buildFilters(){
    const unidades = [...new Set(data.map(x => x.unidad_responsable).filter(Boolean))];
    const procesos = [...new Set(data.map(x => x.proceso).filter(Boolean))];

    unidades.sort(); procesos.sort();

    unidades.forEach(u => unidadFilter.innerHTML += `<option value="${u}">${u}</option>`);
    procesos.forEach(p => procesoFilter.innerHTML += `<option value="${p}">${p}</option>`);
}

/* Filtrar */
function applyFilters(){
    const search = searchInput.value.toLowerCase();
    const unidad = unidadFilter.value;
    const proceso = procesoFilter.value;
    const minMonto = Number(minMontoInput.value);
    const maxMonto = Number(maxMontoInput.value);

    filtered = data.filter(item =>
        (!unidad || item.unidad_responsable === unidad) &&
        (!proceso || item.proceso === proceso) &&
        item.monto >= minMonto &&
        item.monto <= maxMonto &&
        (
          item.tarifa.toLowerCase().includes(search) ||
          item.proceso.toLowerCase().includes(search) ||
          item.unidad_responsable.toLowerCase().includes(search) ||
          item.área.toLowerCase().includes(search)
        )
    );

    renderPage(1);
}

/* Render cards */
function renderPage(page){
    currentPage = page;
    const start = (page-1)*perPage;
    const end = start + perPage;
    const items = filtered.slice(start, end);

    status.innerText = `Mostrando ${items.length} de ${filtered.length} resultados`;

    cardsContainer.innerHTML = items.map((item, index) => `
        <div class="card">

            <span class="tag-origen">${item.origen}</span>

            <h3 class="card-title">${item.proceso}</h3>

            <p class="meta"><strong>Tarifa:</strong> ${item.tarifa}</p>
            <p class="meta"><strong>Monto:</strong> S/ ${item.monto}</p>
            <p class="meta"><strong>Unidad Responsable:</strong> ${item.unidad_responsable}</p>
            <p class="meta"><strong>Área:</strong> ${item.área}</p>

            <div class="actions">
                <button class="btn btn-requisitos" onclick="openModal(${start + index})">
                    <i class="bi bi-list-check"></i> Ver requisitos
                </button>

                <a class="btn btn-mail" href="mailto:${item.correo}">
                    <i class="bi bi-envelope"></i> Correo
                </a>

                <a class="btn btn-ws" href="https://wa.me/${item.telefono}" target="_blank">
                    <i class="bi bi-whatsapp"></i> WhatsApp
                </a>
            </div>
        </div>
    `).join('');

    buildPagination();
}

/* Paginación */
function buildPagination(){
    const pages = Math.ceil(filtered.length / perPage);
    pagination.innerHTML = "";

    for(let i=1; i<=pages; i++){
        pagination.innerHTML += `
            <button class="page-btn ${i===currentPage?'active':''}" onclick="renderPage(${i})">${i}</button>
        `;
    }
}

/* Modal */
function openModal(i){
    const item = filtered[i];

    modalTitle.innerText = item.tarifa;
    modalUnidad.innerText = item.unidad_responsable;
    modalArea.innerText = item.área;
    modalCorreo.innerText = item.correo;
    modalTelefono.innerText = item.telefono;
    modalRequisitos.innerText = item.requisitos;

    modalOverlay.classList.remove("hidden");
}
function closeModal(){ modalOverlay.classList.add("hidden"); }

/* Eventos */
searchInput.oninput = applyFilters;
unidadFilter.onchange  = applyFilters;
procesoFilter.onchange = applyFilters;

minMontoInput.oninput = () => {
    minMontoValue.innerText = minMontoInput.value;
    applyFilters();
};
maxMontoInput.oninput = () => {
    maxMontoValue.innerText = maxMontoInput.value;
    applyFilters();
};

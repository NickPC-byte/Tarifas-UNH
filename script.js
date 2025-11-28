let data = [];

/* ----------------------
   Cargar datos del CSV
---------------------- */
async function loadData() {
    const response = await fetch(SHEET_CSV_URL);
    const text = await response.text();

    const rows = text.split("\n").map(r => r.split(","));

    const headers = rows[0];
    const items = rows.slice(1);

    data = items.map(row => ({
        origen: row[0],
        unidad: row[1],
        cxc: row[2],
        area: row[3],
        proceso: row[4],
        tarifa: row[5],
        monto: row[6],
        requisitos: row[7],
        correo: row[8],
        celular: row[9]
    }));

    buildFilters();
    render(data);
}

/* ----------------------
   Construcción de filtros
---------------------- */
function buildFilters() {
    const unidadSelect = document.getElementById("unidadFilter");
    const procesoSelect = document.getElementById("procesoFilter");

    unidadSelect.innerHTML = `<option value="">Unidad Responsable</option>`;
    procesoSelect.innerHTML = `<option value="">Proceso</option>`;

    [...new Set(data.map(i => i.unidad))].forEach(u => {
        unidadSelect.innerHTML += `<option value="${u}">${u}</option>`;
    });

    [...new Set(data.map(i => i.proceso))].forEach(p => {
        procesoSelect.innerHTML += `<option value="${p}">${p}</option>`;
    });

    unidadSelect.addEventListener("change", applyFilters);
    procesoSelect.addEventListener("change", applyFilters);
    document.getElementById("search").addEventListener("keyup", applyFilters);
}

/* ----------------------
   Aplicar filtros
---------------------- */
function applyFilters() {
    const s = document.getElementById("search").value.toLowerCase();
    const unidad = document.getElementById("unidadFilter").value;
    const proceso = document.getElementById("procesoFilter").value;

    const filtered = data.filter(i =>
        i.tarifa.toLowerCase().includes(s) &&
        (unidad === "" || i.unidad === unidad) &&
        (proceso === "" || i.proceso === proceso)
    );

    render(filtered);
}

/* ----------------------
      Mostrar resultados
---------------------- */
function render(items) {
    const cont = document.getElementById("results");
    cont.innerHTML = "";

    items.forEach(i => {
        cont.innerHTML += `
        <div class="card">
            <span class="tag">Origen: ${i.origen}</span>
            <h3>${i.tarifa}</h3>
            <p><b>Unidad Responsable:</b> ${i.unidad}</p>
            <p><b>Área:</b> ${i.area}</p>
            <p><b>Proceso:</b> ${i.proceso}</p>
            <p><b>Monto:</b> S/ ${i.monto}</p>

            <button onclick="alert('Requisitos:\\n\\n${i.requisitos}')">
                Ver requisitos
            </button>

            <button onclick="window.location.href='mailto:${i.correo}'">
                Enviar correo
            </button>

            <button onclick="window.location.href='https://wa.me/51${i.celular}'">
                WhatsApp
            </button>
        </div>`;
    });
}

loadData();

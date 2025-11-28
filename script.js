const unidadFilter = document.getElementById("unidadFilter");
const procesoFilter = document.getElementById("procesoFilter");
const cardsContainer = document.getElementById("cardsContainer");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("error");

let data = [];

// Función para leer CSV
async function loadCSV() {
    try {
        const response = await fetch(SHEET_CSV_URL);
        if (!response.ok) throw new Error("No se pudo cargar el CSV");

        const csvText = await response.text();
        parseCSV(csvText);
        loading.classList.add("hidden");
    } catch (err) {
        loading.classList.add("hidden");
        errorBox.classList.remove("hidden");
        console.error(err);
    }
}

function parseCSV(csv) {
    const rows = csv.split("\n").map(r => r.split(","));
    const headers = rows.shift();

    data = rows.map(cols => {
        return {
            origen: cols[0],
            unidad: cols[1],
            cxc: cols[2],
            area: cols[3],
            proceso: cols[4],
            tarifa: cols[5],
            monto: cols[6],
            requisitos: cols[7],
            correo: cols[8],
            celular: cols[9]
        };
    });

    loadFilters();
    renderCards();
}

function loadFilters() {
    const unidades = [...new Set(data.map(d => d.unidad))].sort();
    const procesos = [...new Set(data.map(d => d.proceso))].sort();

    unidades.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = u;
        unidadFilter.appendChild(opt);
    });

    procesos.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        procesoFilter.appendChild(opt);
    });

    unidadFilter.addEventListener("change", renderCards);
    procesoFilter.addEventListener("change", renderCards);
}

function renderCards() {
    cardsContainer.innerHTML = "";

    let filtered = data;

    if (unidadFilter.value) {
        filtered = filtered.filter(d => d.unidad === unidadFilter.value);
    }

    if (procesoFilter.value) {
        filtered = filtered.filter(d => d.proceso === procesoFilter.value);
    }

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML = `
            <div class="tag">Origen: ${item.origen}</div>
            <div class="card-title">${item.tarifa}</div>

            <p><strong>Unidad Responsable:</strong> ${item.unidad}</p>
            <p><strong>Área:</strong> ${item.area}</p>
            <p><strong>Proceso:</strong> ${item.proceso}</p>
            <p><strong>Monto:</strong> S/ ${item.monto}</p>
            <p><strong>Requisitos:</strong> ${item.requisitos}</p>

            <p><strong>Correo:</strong> <a href="mailto:${item.correo}">${item.correo}</a></p>
            <p><strong>Celular:</strong> <a href="https://wa.me/51${item.celular}" target="_blank">
                ${item.celular}
            </a></p>
        `;

        cardsContainer.appendChild(card);
    });
}

loadCSV();

// CONFIGURACIÓN GLOBAL
// CAMBIAR POR LA URL DE DESPLIEGUE DEL APPS SCRIPT
const API_URL = CONFIG.API_URL;

// ESTADO GLOBAL
const STATE = {
    isLogged: false,
    pin: "",
    pedidosRaw: [], // Datos completos
    pedidosFiltered: [], // Datos filtrados
    range: {
        start: new Date().toISOString().split('T')[0], // Hoy YYYY-MM-DD
        end: new Date().toISOString().split('T')[0]
    }
};
// INIT
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar inputs con la fecha de hoy
    document.getElementById('date-start').value = STATE.range.start;
    document.getElementById('date-end').value = STATE.range.end;
    const handleDateChange = () => {
        STATE.range.start = document.getElementById('date-start').value;
        STATE.range.end = document.getElementById('date-end').value;
        // Corrección automática: start no puede ser > end
        if (STATE.range.start > STATE.range.end) {
            STATE.range.end = STATE.range.start;
            document.getElementById('date-end').value = STATE.range.end;
        }
        aplicarFiltros();
    };
    document.getElementById('date-start').addEventListener('change', handleDateChange);
    document.getElementById('date-end').addEventListener('change', handleDateChange);
});
// ==========================================
// 🔐 AUTENTICACIÓN (PIN PAD)
// ==========================================
// Lógica de botones del PIN
document.querySelectorAll('.pin-btn[data-num]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (STATE.pin.length < 4) {
            STATE.pin += btn.dataset.num;
            updatePinDots();
        }
    });
});
document.getElementById('btn-clear').addEventListener('click', () => {
    STATE.pin = STATE.pin.slice(0, -1);
    updatePinDots();
});
document.getElementById('btn-enter').addEventListener('click', () => {
    checkPin();
});
document.addEventListener('keydown', (e) => {
    if (!document.getElementById('login-screen').classList.contains('hidden')) {
        if (e.key >= '0' && e.key <= '9') {
            if (STATE.pin.length < 4) {
                STATE.pin += e.key;
                updatePinDots();
            }
        } else if (e.key === 'Backspace') {
            STATE.pin = STATE.pin.slice(0, -1);
            updatePinDots();
        } else if (e.key === 'Enter') {
            checkPin();
        }
    }
});
function updatePinDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
        if (index < STATE.pin.length) {
            dot.classList.remove('bg-gray-300');
            dot.classList.add('bg-yummy-brown', 'scale-110');
        } else {
            dot.classList.add('bg-gray-300');
            dot.classList.remove('bg-yummy-brown', 'scale-110');
        }
    });
}
async function checkPin() {
    // Generar Hash del PIN ingresado
    const msgBuffer = new TextEncoder().encode(STATE.pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (hashHex === CONFIG.PIN_HASH) {
        Swal.fire({
            icon: 'success',
            title: '¡Bienvenido Chef!',
            timer: 1000,
            showConfirmButton: false,
            backdrop: `rgba(0,0,0,0.4)`
        }).then(() => {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            STATE.isLogged = true;
            cargarDatos();
        });
    } else {
        const pad = document.querySelector('.glass');
        pad.classList.add('animate-bounce');
        setTimeout(() => pad.classList.remove('animate-bounce'), 500);
        STATE.pin = "";
        updatePinDots();
    }
}
function logout() {
    STATE.isLogged = false;
    STATE.pin = "";
    updatePinDots();
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}
// ==========================================
// 📱 NAVEGACIÓN
// ==========================================
function switchView(viewName) {
    const btnKanban = document.getElementById('nav-kanban');
    const btnDash = document.getElementById('nav-dashboard');
    const viewKanban = document.getElementById('view-kanban');
    const viewDash = document.getElementById('view-dashboard');
    if (viewName === 'kanban') {
        btnKanban.classList.remove('text-gray-500', 'hover:text-yummy-brown');
        btnKanban.classList.add('bg-white', 'shadow-sm', 'text-yummy-brown');
        btnDash.classList.add('text-gray-500', 'hover:text-yummy-brown');
        btnDash.classList.remove('bg-white', 'shadow-sm', 'text-yummy-brown');
        viewKanban.classList.remove('hidden');
        viewDash.classList.add('hidden');
    } else {
        btnDash.classList.remove('text-gray-500', 'hover:text-yummy-brown');
        btnDash.classList.add('bg-white', 'shadow-sm', 'text-yummy-brown');
        btnKanban.classList.add('text-gray-500', 'hover:text-yummy-brown');
        btnKanban.classList.remove('bg-white', 'shadow-sm', 'text-yummy-brown');
        viewDash.classList.remove('hidden');
        viewKanban.classList.add('hidden');
        renderCharts(); // Re-render charts for size correctness
    }
}
// ==========================================
// 🔄 DATOS & LOGICA
// ==========================================
async function cargarDatos() {
    const icon = document.getElementById('refresh-icon');
    icon.classList.add('animate-spin');
    try {
        if (API_URL === "URL_DE_TU_APPS_SCRIPT_AQUI") {
            // MOCK DATA GENERATOR
            await new Promise(r => setTimeout(r, 800));
            STATE.pedidosRaw = generarMockData();
            aplicarFiltros();
        } else {
            const response = await fetch(`${API_URL}?accion=admin_data`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            STATE.pedidosRaw = data.pedidos;
            aplicarFiltros(); // Procesar datos recibidos
        }
    } catch (error) {
        console.error(error);
        Swal.fire({
            title: 'No se pudo conectar',
            text: 'Verifica tu conexión o que la API_URL sea correcta en admin.js',
            icon: 'error'
        });
    } finally {
        icon.classList.remove('animate-spin');
    }
}
// Helpers de fecha
function parseDateDDMMYYYY(dateStr) {
    // Convierte "26/01/2026" a objeto Date
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    // Mes es 0-indexed en JS Date
    return new Date(parts[2], parts[1] - 1, parts[0]);
}
function formatDateDDMM(isoStr) {
    const parts = isoStr.split('-');
    return `${parts[2]}/${parts[1]}`;
}
function aplicarFiltros() {
    // Crear objetos Date para inicio y fin de rango (Seteamos horas para comparar todo el día)
    const start = new Date(STATE.range.start); start.setHours(0, 0, 0, 0);
    // Para la fecha fin, queremos que incluya todo el día, hasta las 23:59:59
    // Ojo: new Date('2026-01-26') es media noche UTC o local dependiendo del navegador.
    // Usamos el constructor con componentes para certeza local:
    const sParts = STATE.range.start.split('-');
    const eParts = STATE.range.end.split('-');
    // Rango Start (00:00:00)
    const dStart = new Date(sParts[0], sParts[1] - 1, sParts[2], 0, 0, 0);
    // Rango End (23:59:59)
    const dEnd = new Date(eParts[0], eParts[1] - 1, eParts[2], 23, 59, 59);
    STATE.pedidosFiltered = STATE.pedidosRaw.filter(p => {
        const pDate = parseDateDDMMYYYY(p.fecha); // Backend envia DD/MM/YYYY
        return pDate && pDate >= dStart && pDate <= dEnd;
    });
    // Actualizar etiquetas de UI
    const rangoTxt = STATE.range.start === STATE.range.end ?
        formatDateDDMM(STATE.range.start) :
        `${formatDateDDMM(STATE.range.start)} - ${formatDateDDMM(STATE.range.end)}`;
    document.getElementById('lbl-fecha-kanban').textContent = rangoTxt;
    document.getElementById('lbl-fecha-dash').textContent = rangoTxt;
    renderKanban();
    actualizarMetricasDOM();
    // Solo renderizar gráficos si están visibles
    if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
        renderCharts();
    }
}
// Generador de datos falsos para desarrollo
function generarMockData() {
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const fmt = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`
    };
    return [
        { id: 1001, cliente: "María López", items: "2x Roles Canela\n1x Café", total: 195, estatus: "Pendiente", fecha: fmt(today), hora: "08:30" },
        { id: 1002, cliente: "Juan Pérez", items: "1x Pastel Zanahoria", total: 350, estatus: "Horneando", fecha: fmt(today), hora: "09:15" },
        { id: 1003, cliente: "Ana Silva", items: "3x Brownies", total: 120, estatus: "Entregado", fecha: fmt(today), hora: "10:00" },
        { id: 1004, cliente: "Carlos Ruiz", items: "1x Pay de Queso", total: 200, estatus: "Finalizado", fecha: fmt(yesterday), hora: "11:45" },
        { id: 1005, cliente: "Luisa Méndez", items: "6x Roles Canela", total: 450, estatus: "Pendiente", fecha: fmt(today), hora: "12:20" },
        { id: 1006, cliente: "Pedro K.", items: "2x Conchas", total: 50, estatus: "Finalizado", fecha: fmt(yesterday), hora: "13:00" },
        { id: 1007, cliente: "Sofia R.", items: "1x Pastel Chocolate", total: 400, estatus: "Pendiente", fecha: fmt(today), hora: "14:10" },
    ];
}
// --- KANBAN ---
function renderKanban() {
    ['Pendiente', 'Horneando', 'Entregado', 'Finalizado'].forEach(status => {
        const container = document.getElementById(`col-${status.toLowerCase()}`);
        container.innerHTML = '';
        const pedidosCol = STATE.pedidosFiltered.filter(p => p.estatus === status);
        document.getElementById(`count-${status.toLowerCase()}`).textContent = pedidosCol.length;
        pedidosCol.forEach(p => {
            const card = document.createElement('div');
            let borderClass =
                status === 'Pendiente' ? 'border-l-yellow-400' :
                    status === 'Horneando' ? 'border-l-orange-500' :
                        status === 'Entregado' ? 'border-l-blue-500' : 'border-l-green-500';
            card.className = `glass bg-white/60 p-3 rounded-xl cursor-grab active:cursor-grabbing relative border-l-4 ${borderClass} shadow-sm hover:shadow-md transition-shadow`;
            card.setAttribute('data-id', p.id);
            card.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <span class="text-xs font-bold text-gray-500">#${p.id}</span>
                    <span class="text-[10px] bg-gray-100/80 px-1.5 py-0.5 rounded text-gray-400 font-medium">${p.fecha}</span>
                </div>
                <h4 class="font-bold text-gray-800 text-sm mb-1 line-clamp-1">${p.cliente}</h4>
                <div class="text-xs text-gray-600 mb-2 space-y-0.5">
                    ${p.items.split('\n').slice(0, 2).map(i => `<p class="truncate">• ${i}</p>`).join('')}
                    ${p.items.split('\n').length > 2 ? '<p class="text-gray-400 italic text-[10px]">+ más</p>' : ''}
                </div>
                <div class="flex justify-between items-center mt-2 border-t border-gray-200/50 pt-2">
                    <span class="font-bold text-yummy-brown text-sm">$${p.total}</span>
                    <div class="flex gap-2">
                        <button onclick="verDetalle(${p.id})" class="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-gray-600 font-medium transition-colors">Ver</button>
                        <button onclick="cancelarPedido(${p.id})" class="text-[10px] bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1 rounded font-medium transition-colors" title="Cancelar"><i class="fas fa-trash"></i></button>
                    </div>
                    <span class="text-[10px] text-gray-400"><i class="far fa-clock"></i> ${p.hora}</span>
                </div>
            `;
            container.appendChild(card);
        });
    });
    initSortable();
}
let sortables = [];
function initSortable() {
    sortables.forEach(s => s.destroy());
    sortables = [];
    ['col-pendiente', 'col-horneando', 'col-entregado', 'col-finalizado'].forEach(id => {
        const el = document.getElementById(id);
        const sortable = Sortable.create(el, {
            group: 'kanban',
            animation: 200,
            delay: 100, // Touch delay
            delayOnTouchOnly: true,
            ghostClass: 'opacity-50',
            onEnd: function (evt) {
                const itemEl = evt.item;
                const newStatus = evt.to.getAttribute('data-status');
                const oldStatus = evt.from.getAttribute('data-status');
                const orderId = itemEl.getAttribute('data-id');
                if (newStatus !== oldStatus) {
                    actualizarEstatusLocal(orderId, newStatus);
                }
            }
        });
        sortables.push(sortable);
    });
}
function actualizarEstatusLocal(id, nuevoEstatus) {
    const pRaw = STATE.pedidosRaw.find(p => p.id == id);
    if (pRaw) {
        // Optimistic update
        const oldStatus = pRaw.estatus;
        pRaw.estatus = nuevoEstatus;
        // Refresh local UI immediately
        aplicarFiltros();
        // Send to backend
        if (API_URL !== "URL_DE_TU_APPS_SCRIPT_AQUI") {
            const Toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 3000 });
            // "fire and forget" with error handling fetch
            fetch(API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'actualizar_estatus', id: id, nuevoEstatus: nuevoEstatus })
            }).catch(err => {
                // Revert on error?
                console.error("Fallo red", err);
                pRaw.estatus = oldStatus;
                aplicarFiltros();
                Toast.fire({ icon: 'error', title: 'Error de red. Cambio revertido.' });
            });
        }
    }
}

function verDetalle(id) {
    const p = STATE.pedidosRaw.find(p => p.id == id);
    if (!p) return;

    Swal.fire({
        title: `Pedido #${p.id}`,
        html: `
            <div class="text-left font-sans">
                <p class="mb-2"><strong>Cliente:</strong> ${p.cliente}</p>
                <p class="mb-2"><strong>Fecha:</strong> ${p.fecha} - ${p.hora}</p>
                <div class="my-3 border-y py-2 border-gray-200">
                    <p class="font-bold text-sm text-gray-500 mb-1">Items:</p>
                    <div class="text-sm whitespace-pre-line">${p.items}</div>
                </div>
                <div class="flex justify-between items-end">
                    <span class="text-xs text-gray-400">Estatus: ${p.estatus}</span>
                    <span class="text-2xl font-bold text-yummy-brown">$${p.total}</span>
                </div>
            </div>
        `,
        confirmButtonColor: '#4A3728',
        confirmButtonText: 'Cerrar'
    });
}

function cancelarPedido(id) {
    Swal.fire({
        title: '¿Cancelar Pedido?',
        text: "Este pedido desaparecerá del tablero y no contará en ventas.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'Volver'
    }).then((result) => {
        if (result.isConfirmed) {
            actualizarEstatusLocal(id, 'Cancelado');
            Swal.fire(
                'Cancelado',
                'El pedido ha sido cancelado.',
                'success'
            );
        }
    });
}

// --- DASHBOARD METRICS ---
function actualizarMetricasDOM() {
    const data = STATE.pedidosFiltered;
    // Filtramos cancelados para la suma de ventas
    const validos = data.filter(p => p.estatus !== 'Cancelado');
    const ventas = validos.reduce((sum, p) => sum + Number(p.total || 0), 0);
    const count = validos.length;
    const finalizados = validos.filter(p => p.estatus === 'Finalizado').length;
    const ticket = count > 0 ? (ventas / count).toFixed(0) : 0;
    const tasa = count > 0 ? ((finalizados / count) * 100).toFixed(0) : 0;
    animateValue("kpi-ventas", ventas, "$");
    animateValue("kpi-pedidos", count, "");
    animateValue("kpi-ticket", ticket, "$");
    document.getElementById("kpi-tasa").textContent = tasa + "%";
}
function animateValue(id, value, prefix) {
    const el = document.getElementById(id);
    if (el) el.textContent = prefix + Number(value).toLocaleString();
}
// --- CHARTS ---
let charts = {};
function renderCharts() {
    const ctxTimeline = document.getElementById('chart-timeline');
    const ctxStatus = document.getElementById('chart-status');
    const ctxProd = document.getElementById('chart-products');
    const ctxCust = document.getElementById('chart-customers');
    // Safety check if elements exist (e.g. view switch)
    if (!ctxTimeline || !ctxStatus) return;
    const colors = {
        brown: '#4A3728',
        lightBrown: '#D4A373',
        cream: '#FAEDCD',
        green: '#a7c957',
        blue: '#457b9d',
        red: '#e63946'
    };
    // ----------------------
    // 1. TIMELINE - LOGICA SMART (Dia vs Hora)
    // ----------------------
    const isSingleDay = STATE.range.start === STATE.range.end;
    const timelineData = {};
    let timelineLabel = '';
    // Solo consideramos no-cancelados
    const activePedidos = STATE.pedidosFiltered.filter(p => p.estatus !== 'Cancelado');
    if (isSingleDay) {
        timelineLabel = 'Ventas por Hora';
        // Mock hours 08-20
        for (let i = 8; i <= 20; i++) timelineData[`${i}:00`] = 0;
        activePedidos.forEach(p => {
            const h = (p.hora || "12:00").split(':')[0]; // Fallback mock
            const key = `${parseInt(h)}:00`;
            if (timelineData[key] !== undefined) timelineData[key] += Number(p.total);
            else timelineData[key] = (timelineData[key] || 0) + Number(p.total);
        });
    } else {
        timelineLabel = 'Ventas por Día';
        // Agrupar por fechas únicas encontradas
        activePedidos.forEach(p => {
            if (timelineData[p.fecha] !== undefined) timelineData[p.fecha] += Number(p.total);
            else timelineData[p.fecha] = Number(p.total);
        });
    }
    // Sort Logic
    let sortedKeys = Object.keys(timelineData);
    if (isSingleDay) {
        sortedKeys.sort((a, b) => parseInt(a) - parseInt(b));
    } else {
        sortedKeys.sort((a, b) => {
            return parseDateDDMMYYYY(a) - parseDateDDMMYYYY(b);
        });
    }
    const timelineValues = sortedKeys.map(k => timelineData[k]);
    createUpdateChart('chart-timeline', 'line', {
        labels: sortedKeys,
        datasets: [{
            label: timelineLabel + ' ($)',
            data: timelineValues,
            borderColor: colors.brown,
            backgroundColor: 'rgba(74, 55, 40, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#fff',
            pointBorderColor: colors.brown,
            pointRadius: 4
        }]
    });
    // ----------------------
    // 2. STATUS (Doughnut)
    // ----------------------
    const statusCounts = { 'Pendiente': 0, 'Horneando': 0, 'Entregado': 0, 'Finalizado': 0 };
    activePedidos.forEach(p => {
        if (statusCounts[p.estatus] !== undefined) statusCounts[p.estatus]++;
        // Else ignora raros (o cancelados que ya filtramos)
    });
    createUpdateChart('chart-status', 'doughnut', {
        labels: Object.keys(statusCounts),
        datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: ['#fbbf24', '#f97316', '#3b82f6', '#22c55e'],
            borderWidth: 0,
            hoverOffset: 4
        }]
    }, { cutout: '65%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } } });
    // ----------------------
    // 3. PROD (Bars)
    // ----------------------
    const prodMap = {};
    activePedidos.forEach(p => {
        // Items string example: "2x Roles\n1x Café"
        p.items.split('\n').forEach(line => {
            // Regex to match "2x Nombre" or "2 x Nombre" or "2 Nombre"
            const match = line.match(/^\s*(\d+)\s*x?\s+([^\(]+)/i);
            if (match) {
                const qty = parseInt(match[1]);
                const name = match[2].trim();
                prodMap[name] = (prodMap[name] || 0) + qty;
            } else {
                // Fallback: si no hay numero explicito, asumir 1
                const fallbackName = line.split('(')[0].trim(); // Remove brackets
                if (fallbackName) {
                    prodMap[fallbackName] = (prodMap[fallbackName] || 0) + 1;
                }
            }
        });
    });
    const topProds = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    createUpdateChart('chart-products', 'bar', {
        labels: topProds.map(x => x[0].length > 15 ? x[0].substr(0, 15) + '...' : x[0]),
        datasets: [{
            label: 'Unidades',
            data: topProds.map(x => x[1]),
            backgroundColor: colors.lightBrown,
            borderRadius: 4,
            barThickness: 20
        }]
    }, { indexAxis: 'y' });
    // ----------------------
    // 4. CLIENTS (Bars)
    // ----------------------
    const custMap = {};
    activePedidos.forEach(p => custMap[p.cliente] = (custMap[p.cliente] || 0) + 1);
    const topCust = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    createUpdateChart('chart-customers', 'bar', {
        labels: topCust.map(x => x[0].split(' ')[0]), // Primer nombre
        datasets: [{
            label: 'Pedidos',
            data: topCust.map(x => x[1]),
            backgroundColor: colors.brown,
            borderRadius: 4,
            barThickness: 30
        }]
    });
}
function createUpdateChart(canvasId, type, data, extraOptions = {}) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: type === 'doughnut' },
        },
        scales: type !== 'doughnut' ? {
            y: { beginAtZero: true, grid: { display: false } },
            x: { grid: { display: false } }
        } : {}
    };
    charts[canvasId] = new Chart(ctx, {
        type: type,
        data: data,
        options: { ...defaultOptions, ...extraOptions }
    });
}
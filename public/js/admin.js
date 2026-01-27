import { db } from './firebase-config.js';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { seedDatabase, seedOrders, cleanupGhostData } from './seeder.js';
import { ProductsManager } from './products-manager.js';

// Expose SEEDERS
window.seedDatabase = seedDatabase;
window.seedOrders = seedOrders;
window.cleanupGhostData = cleanupGhostData;
window.renderProduction = renderProduction;
window.abrirModalToppings = abrirModalToppings;
window.cerrarModalToppings = cerrarModalToppings;
window.cerrarModalDetalle = cerrarModalDetalle;
window.copyToClipboard = copyToClipboard;
window.exportPedidosExcel = exportPedidosExcel;
window.exportClientesExcel = exportClientesExcel;
window.cargarDatos = cargarDatos;

// ESTADO GLOBAL
const STATE = {
    isLogged: false,
    pin: "",
    pedidosRaw: [], // Información general (Kanban/Lista)
    detallesRaw: [], // Desglose para analítica (Flattened items)
    metricasRaw: {}, // Totales backend (Calculados en frontend ahora)
    pedidosFiltered: [], // Render Kanban
    detallesFiltered: [], // Render Gráficas
    categories: [], // Dynamic Categories
    productsRaw: [], // Products cache
    productFilter: 'all', // Current filter
    range: {
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Últimos 30 días
        end: new Date().toISOString().split('T')[0]
    }
};

// ==========================================
// 🔐 LOGIN & INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkSesion();
    setupEventListeners();
    // Default Tab
    switchView('lista');
});

function checkSesion() {
    const sessionPin = localStorage.getItem('yummy_pin');
    if (sessionPin) {
        STATE.pin = sessionPin;
        STATE.isLogged = true;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        cargarDatos();
    }
}

function checkPin() {
    const input = document.getElementById('pin-input');
    const val = input.value;
    const CORRECT_PIN = "1970";

    if (val === CORRECT_PIN) {
        localStorage.setItem('yummy_pin', val);
        STATE.isLogged = true;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        cargarDatos();
    } else {
        input.classList.add('animate-pulse', 'border-red-500');
        setTimeout(() => input.classList.remove('animate-pulse', 'border-red-500'), 500);
        Swal.fire({
            icon: 'error',
            title: 'PIN Incorrecto',
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 1500
        });
        window.clearPin();
    }
}
window.checkPin = checkPin;

window.logout = function () {
    localStorage.removeItem('yummy_pin');
    location.reload();
}

window.addPin = function (n) {
    const i = document.getElementById('pin-input');
    if (i && i.value.length < 4) {
        i.value += n;
        updateDots();
    }
}

window.clearPin = function () {
    const i = document.getElementById('pin-input');
    if (i) {
        i.value = "";
        updateDots();
    }
}

function updateDots() {
    const i = document.getElementById('pin-input');
    const len = i.value.length;
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
        if (idx < len) {
            dot.classList.remove('bg-gray-300');
            dot.classList.add('bg-yummy-brown', 'scale-110');
        } else {
            dot.classList.add('bg-gray-300');
            dot.classList.remove('bg-yummy-brown', 'scale-110');
        }
    });
}

// ==========================================
// 🔄 DATOS & LOGICA (FIREBASE)
// ==========================================
function cargarDatos() {
    const icon = document.getElementById('refresh-icon');
    if (icon) icon.classList.add('animate-spin');

    const q = query(collection(db, "pedidos"), orderBy("fecha", "desc"));

    // Real-time Listener
    onSnapshot(q, async (snapshot) => {
        const pedidos = [];
        const detalles = [];
        let totalVentas = 0;

        // Cargar Categorías Globalmente si aún no están
        if (STATE.categories.length === 0) {
            try {
                STATE.categories = await ProductsManager.loadCategories();
                updateCategoryDropdowns();
            } catch (e) {
                console.error("Error cargando categorías:", e);
            }
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const pid = docSnap.id;

            // 1. Normalizar Pedido
            // Firestore data: { cliente: {...}, items: [...], total: 123, ... }
            const p = {
                id: pid,
                fecha: data.fecha, // ISO String
                hora: new Date(data.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                cliente: data.cliente?.nombre || "Anonimo",
                tel: data.cliente?.tel,
                direccion: data.cliente?.direccion,
                items: formatItemsString(data.items), // String para UI
                itemsArray: data.items || [], // Array real
                total: parseFloat(data.total) || 0,
                estatus: data.estatus || "Pendiente",
                observaciones: data.observaciones || "",
                metodo: data.metodo,
                pago: data.pago
            };
            pedidos.push(p);

            // 2. Aplanar Detalles (para Gráficas)
            if (Array.isArray(data.items)) {
                data.items.forEach(item => {
                    detalles.push({
                        ID_Pedido: pid,
                        Categoria: item.categoria,
                        Producto: item.nombre,
                        Cantidad: item.cantidad,
                        Precio_Unitario: item.precioBase,
                        Subtotal: item.subtotal,
                        Fecha: data.fecha // Needed for filtering charts by date
                    });
                    totalVentas += item.subtotal;
                });
            }
        });

        STATE.pedidosRaw = pedidos;
        STATE.detallesRaw = detalles;

        // Auto-refresh CRM if active
        if (document.getElementById('view-clientes') && !document.getElementById('view-clientes').classList.contains('hidden')) {
            renderClientes();
        }

        console.log("🔥 Datos Firebase actualizados:", pedidos.length);
        if (icon) icon.classList.remove('animate-spin');
        aplicarFiltros();
    }, (error) => {
        console.error("Error Firestore:", error);
        Swal.fire('Error', 'No se pudo conectar con la base de datos.', 'error');
        if (icon) icon.classList.remove('animate-spin');
    });
}

function formatItemsString(items) {
    if (!Array.isArray(items) || items.length === 0) return "Sin items";
    return items.map(i => `${i.cantidad}x ${i.nombre}${i.extrasTexto ? ` (${i.extrasTexto})` : ''}`).join('\n');
}

// ==========================================
// 🛠️ FILTROS & RENDER
// ==========================================
async function aplicarFiltros() {
    // Definir Rango Local
    const start = new Date(STATE.range.start); start.setHours(0, 0, 0, 0);
    const endParts = STATE.range.end.split('-');
    const end = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59);

    STATE.pedidosFiltered = STATE.pedidosRaw.filter(p => {
        const d = new Date(p.fecha);
        return d && d >= start && d <= end;
    });

    // Filtro Detalles (Fecha está en ISO en el objeto aplanado)
    STATE.detallesFiltered = STATE.detallesRaw.filter(d => {
        const date = new Date(d.Fecha);
        return date && date >= start && date <= end;
    });

    // Update UI Labels
    const rangeLabel = `${formatDateDDMM(STATE.range.start)} - ${formatDateDDMM(STATE.range.end)}`;
    const lblKanban = document.getElementById('lbl-fecha-kanban'); if (lblKanban) lblKanban.textContent = rangeLabel;
    const lblDash = document.getElementById('lbl-fecha-dash'); if (lblDash) lblDash.textContent = rangeLabel;

    renderKanban();
    renderList();
    renderProduction();
    actualizarMetricasDOM();

    if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
        renderCharts();
    }
}

// ==========================================
// 🎨 UI: KANBAN
// ==========================================
function renderKanban() {
    ['Pendiente', 'Horneando', 'Entregado', 'Finalizado'].forEach(status => {
        const colId = `col-${status.toLowerCase()}`;
        const col = document.getElementById(colId);
        if (!col) return;

        col.innerHTML = '';
        const items = STATE.pedidosFiltered.filter(p => p.estatus === status);

        const countBadge = document.getElementById(`count-${status.toLowerCase()}`);
        if (countBadge) countBadge.innerText = items.length;

        items.forEach(p => {
            const card = document.createElement('div');
            card.className = "bg-white p-3 rounded-xl shadow-sm border border-gray-100 mb-3 cursor-grab hover:shadow-md transition-all";
            card.setAttribute('data-id', p.id);

            // Color tag based on method
            const tagColor = p.metodo === 'envio' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600';
            const metodoIcon = p.metodo === 'envio' ? '<i class="fas fa-motorcycle"></i>' : '<i class="fas fa-store"></i>';

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="font-bold text-[#4A3728] text-sm md:text-base cursor-pointer hover:underline" onclick="verDetallePedido('${p.id}')">#${p.id.substr(0, 4)} ${p.cliente}</span>
                    <span class="text-[10px] px-2 py-1 rounded-full ${tagColor} font-bold flex items-center gap-1">
                        ${metodoIcon} ${p.metodo === 'envio' ? 'Envío' : 'Recoger'}
                    </span>
                </div>
                <div class="space-y-1 mb-3">
                     <p class="text-xs text-gray-500 whitespace-pre-line leading-tight">${p.items || "Sin detalle"}</p>
                </div>
                <div class="flex justify-between items-center border-t border-gray-50 pt-2">
                    <span class="text-xs font-bold text-gray-400"><i class="far fa-clock mr-1"></i>${p.hora}</span>
                    <span class="font-bold text-[#4A3728]">$${p.total}</span>
                </div>
            `;
            col.appendChild(card);
        });
    });
}

// ==========================================
// 🎨 UI: LISTA (TABLA PREMIUM)
// ==========================================
function renderList() {
    const tbody = document.getElementById('lista-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('order-search')?.value.toLowerCase() || "";
    const dateFilter = document.getElementById('order-date-filter')?.value || "";

    // Filtrado Universal (ID, Cliente) + Fecha Específica
    let filtered = STATE.pedidosFiltered.filter(p => {
        const matchesSearch = p.id.toLowerCase().includes(searchTerm) || p.cliente.toLowerCase().includes(searchTerm);
        const matchesDate = !dateFilter || p.fecha.startsWith(dateFilter);
        return matchesSearch && matchesDate;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-20 text-center text-gray-400">
            <i class="fas fa-search text-3xl mb-4 block opacity-20"></i>
            No se encontraron pedidos con esos filtros.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const statusConfig = {
            'Pendiente': { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'fa-clock' },
            'Horneando': { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'fa-fire' },
            'Entregado': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'fa-check' },
            'Finalizado': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'fa-star' },
            'Cancelado': { bg: 'bg-red-100', text: 'text-red-700', icon: 'fa-times' }
        };
        const conf = statusConfig[p.estatus] || { bg: 'bg-gray-100', text: 'text-gray-600', icon: 'fa-question' };

        return `
            <tr class="hover:bg-gray-50/80 transition-colors group">
                <td class="px-6 py-4">
                    <button onclick="copyToClipboard('${p.id}')" title="Clic para copiar ID"
                        class="text-[10px] font-mono font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-md hover:bg-yummy-accent hover:text-white transition-all">
                        #${p.id.substr(0, 5)}
                    </button>
                </td>
                <td class="px-6 py-4">
                    <div class="text-xs font-bold text-gray-700">${formatDateFullShort(p.fecha)}</div>
                    <div class="text-[10px] text-gray-400">${p.hora}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs">
                            ${p.cliente.charAt(0)}
                        </div>
                        <div>
                            <div class="text-xs font-bold text-gray-800">${p.cliente}</div>
                            <div class="flex items-center gap-1 text-[10px] text-gray-400">
                                <i class="fab fa-whatsapp text-emerald-500"></i> ${p.tel || '-'}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="text-[10px] font-bold px-2 py-1 rounded-full ${p.metodo === 'envio' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}">
                        <i class="fas ${p.metodo === 'envio' ? 'fa-motorcycle' : 'fa-store'} mr-1"></i>
                        ${p.metodo === 'envio' ? 'ENVÍO' : 'RECOGER'}
                    </span>
                </td>
                <td class="px-6 py-4 text-right font-black text-yummy-brown text-sm">
                    $${p.total}
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${conf.bg} ${conf.text}">
                        <i class="fas ${conf.icon}"></i>
                        ${p.estatus}
                    </span>
                </td>
                <td class="px-6 py-4 text-center">
                    <button onclick="verDetallePedido('${p.id}')" 
                        class="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm hover:border-yummy-brown hover:text-yummy-brown transition-all">
                        Ver Detalle
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function formatDateFullShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        Swal.fire({ toast: true, position: 'top', title: 'ID Copiado', icon: 'success', showConfirmButton: false, timer: 1000 });
    });
}
window.updateStatus = async function (id, newStatus) {
    try {
        const ref = doc(db, "pedidos", id);
        await updateDoc(ref, { estatus: newStatus });
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: 'Estatus actualizado' });
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo actualizar', 'error');
    }
}
window.verDetallePedido = function (id) {
    const p = STATE.pedidosRaw.find(x => x.id === id);
    if (!p) return;

    document.getElementById('det-id-display').innerText = `Pedido #${p.id.substr(0, 5)}`;
    document.getElementById('det-fecha-display').innerText = `${formatDateFullShort(p.fecha)} ${p.hora}`;
    document.getElementById('det-cliente').innerText = p.cliente;
    document.getElementById('det-tel').innerText = p.tel || 'Sin teléfono';
    document.getElementById('det-dir').innerText = p.direccion || 'Recoger en tienda';
    document.getElementById('det-total-display').innerText = `$${p.total}`;

    // Items List
    const list = document.getElementById('det-items-list');
    list.innerHTML = p.itemsArray.map(item => `
        <div class="flex justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-100">
            <div>
                <span class="text-sm font-bold text-gray-800">${item.cantidad}x ${item.nombre}</span>
                <p class="text-[10px] text-gray-400">${item.extrasTexto || ''}</p>
            </div>
            <span class="text-sm font-bold text-yummy-brown">$${item.subtotal}</span>
        </div>
    `).join('');

    // Observaciones
    const obsBox = document.getElementById('det-obs-box');
    if (p.observaciones) {
        obsBox.classList.remove('hidden');
        document.getElementById('det-obs').innerText = p.observaciones;
    } else {
        obsBox.classList.add('hidden');
    }

    // Status Selector
    document.getElementById('det-status-select').value = p.estatus;

    // Save Button Logic
    document.getElementById('btn-save-status').onclick = async () => {
        const newStatus = document.getElementById('det-status-select').value;
        const btn = document.getElementById('btn-save-status');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        try {
            await updateStatus(p.id, newStatus);
            cerrarModalDetalle();
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        }
    };

    document.getElementById('modal-detalle-pedido').classList.remove('hidden');
}

function cerrarModalDetalle() {
    document.getElementById('modal-detalle-pedido').classList.add('hidden');
}


// ==========================================
// 📊 METRICAS & CHARTS
// ==========================================
function actualizarMetricasDOM() {
    const totalVentas = STATE.pedidosFiltered.reduce((acc, p) => acc + p.total, 0);
    const pedidosCount = STATE.pedidosFiltered.length;
    const ticketPromedio = pedidosCount > 0 ? (totalVentas / pedidosCount) : 0;

    // Tasa de Finalización (Finalizados / Totales)
    const finalizadosCount = STATE.pedidosFiltered.filter(p => p.estatus === 'Finalizado').length;
    const tasa = pedidosCount > 0 ? (finalizadosCount / pedidosCount * 100) : 0;

    const elVentas = document.getElementById('kpi-ventas');
    const elPedidos = document.getElementById('kpi-pedidos');
    const elTicket = document.getElementById('kpi-ticket');
    const elTasa = document.getElementById('kpi-tasa');

    if (elVentas) elVentas.innerText = `$${totalVentas.toLocaleString()}`;
    if (elPedidos) elPedidos.innerText = pedidosCount;
    if (elTicket) elTicket.innerText = `$${ticketPromedio.toLocaleString()}`;
    if (elTasa) elTasa.innerText = `${tasa.toFixed(1)}%`;
}

let chartVentas, chartProd;

function renderCharts() {
    const ctxTimeline = document.getElementById('chart-timeline');
    const ctxStatus = document.getElementById('chart-status');
    const ctxProducts = document.getElementById('chart-products');
    const ctxCustomers = document.getElementById('chart-customers');

    if (!ctxTimeline || !ctxStatus || !ctxProducts || !ctxCustomers) return;

    // 1. Timeline (Ventas por Día)
    const ventasPorDia = {};
    STATE.pedidosFiltered.forEach(p => {
        const dia = p.fecha.split('T')[0];
        ventasPorDia[dia] = (ventasPorDia[dia] || 0) + p.total;
    });
    const labelsDia = Object.keys(ventasPorDia).sort();
    const dataDia = labelsDia.map(d => ventasPorDia[d]);

    if (chartVentas) chartVentas.destroy();
    chartVentas = new Chart(ctxTimeline, {
        type: 'line',
        data: {
            labels: labelsDia,
            datasets: [{
                label: 'Ventas ($)',
                data: dataDia,
                borderColor: '#4A3728',
                backgroundColor: 'rgba(74, 55, 40, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // 2. Distribución Estatus
    const statusCount = {};
    STATE.pedidosFiltered.forEach(p => {
        statusCount[p.estatus] = (statusCount[p.estatus] || 0) + 1;
    });

    let chartStatus; // Local
    if (window.myChartStatus) window.myChartStatus.destroy();
    window.myChartStatus = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusCount),
            datasets: [{
                data: Object.values(statusCount),
                backgroundColor: ['#4A3728', '#D4A373', '#E9DAC1', '#9C6644']
            }]
        },
        options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });

    // 3. Top Productos
    const prodCount = {};
    STATE.detallesFiltered.forEach(d => {
        prodCount[d.Producto] = (prodCount[d.Producto] || 0) + d.Cantidad;
    });
    const topProds = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (chartProd) chartProd.destroy();
    chartProd = new Chart(ctxProducts, {
        type: 'bar',
        data: {
            labels: topProds.map(x => x[0]),
            datasets: [{
                label: 'Unidades',
                data: topProds.map(x => x[1]),
                backgroundColor: '#4A3728'
            }]
        },
        options: { indexAxis: 'y', responsive: true }
    });

    // 4. Ventas por Categoría (Normalizado)
    const catVentas = {};
    const catLabelsMap = {}; // slug -> pretty name

    STATE.detallesFiltered.forEach(d => {
        const slug = (d.Categoria || "").toLowerCase().trim().replace(/\s+/g, '-');
        catVentas[slug] = (catVentas[slug] || 0) + d.Subtotal;

        if (!catLabelsMap[slug]) {
            const cat = STATE.categories.find(c => c.valor === slug);
            catLabelsMap[slug] = cat ? cat.nombre : (d.Categoria || slug);
        }
    });

    if (window.myChartCats) window.myChartCats.destroy();
    window.myChartCats = new Chart(ctxCustomers, {
        type: 'pie',
        data: {
            labels: Object.keys(catVentas).map(slug => catLabelsMap[slug]),
            datasets: [{
                data: Object.values(catVentas),
                backgroundColor: ['#4A3728', '#D4A373', '#E9DAC1', '#9C6644', '#7F5539']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderProduction() {
    const tbody = document.getElementById('prod-table-body');
    const chartCtx = document.getElementById('chart-prod-cat');
    if (!tbody || !chartCtx) return;

    // Filters from UI
    const filterCat = document.getElementById('prod-filter-cat')?.value || 'all';
    const filterMethod = document.getElementById('prod-filter-method')?.value || 'all';

    // Period label
    const lblDateProd = document.getElementById('lbl-fecha-prod');
    if (lblDateProd) lblDateProd.textContent = `${formatDateDDMM(STATE.range.start)} - ${formatDateDDMM(STATE.range.end)}`;

    // Solo items de pedidos 'Pendiente' o 'Horneando'
    let pedidosEnProduccion = STATE.pedidosFiltered.filter(p => p.estatus === 'Pendiente' || p.estatus === 'Horneando');

    // Apply Method Filter
    if (filterMethod !== 'all') {
        pedidosEnProduccion = pedidosEnProduccion.filter(p => p.metodo === filterMethod);
    }

    // Aplanar items de esos pedidos
    let itemsProduccion = [];
    pedidosEnProduccion.forEach(p => {
        itemsProduccion.push(...p.itemsArray.map(item => ({ ...item, metodo: p.metodo })));
    });

    // Apply Category Filter
    if (filterCat !== 'all') {
        itemsProduccion = itemsProduccion.filter(i => {
            const itemCat = (i.categoria || "").toLowerCase().replace(/\s+/g, '-');
            return itemCat === filterCat;
        });
    }

    // Calcular KPIs
    const countTotal = itemsProduccion.reduce((acc, i) => acc + i.cantidad, 0);
    const countEnvio = itemsProduccion.filter(i => i.metodo === 'envio').reduce((acc, i) => acc + i.cantidad, 0);
    const countRecoger = itemsProduccion.filter(i => i.metodo === 'recoger').reduce((acc, i) => acc + i.cantidad, 0);

    document.getElementById('prod-kpi-total').textContent = countTotal;
    document.getElementById('prod-kpi-envio').textContent = countEnvio;
    document.getElementById('prod-kpi-recoger').textContent = countRecoger;

    // Agrupar por Producto y Categoría (Normalizado)
    const resumenProd = {};
    const resumenCat = {};
    const catLabelsMapProd = {};

    itemsProduccion.forEach(d => {
        resumenProd[d.nombre] = (resumenProd[d.nombre] || 0) + d.cantidad;

        const slug = (d.categoria || "").toLowerCase().trim().replace(/\s+/g, '-');
        resumenCat[slug] = (resumenCat[slug] || 0) + d.cantidad;

        if (!catLabelsMapProd[slug]) {
            const cat = STATE.categories.find(c => c.valor === slug);
            catLabelsMapProd[slug] = cat ? cat.nombre : (slug.charAt(0).toUpperCase() + slug.slice(1));
        }
    });

    // Render Tabla
    tbody.innerHTML = Object.entries(resumenProd).map(([name, qty]) => `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 font-medium text-gray-700">${name}</td>
            <td class="px-4 py-3 text-right font-bold text-yummy-brown text-lg">${qty}</td>
        </tr>
    `).join('') || '<tr><td colspan="2" class="text-center py-10 text-gray-400">Sin órdenes en este periodo</td></tr>';

    // Render Chart
    if (window.myChartProd) window.myChartProd.destroy();
    window.myChartProd = new Chart(chartCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(resumenCat).map(slug => catLabelsMapProd[slug]),
            datasets: [{
                label: 'Unidades',
                data: Object.values(resumenCat),
                backgroundColor: '#D4A373',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}


// ==========================================
// 🕹️ INTERACCION
// ==========================================
window.switchView = function (view) {
    // Hide all views
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));

    // Show selected view
    const viewEl = document.getElementById(`view-${view}`);
    if (viewEl) viewEl.classList.remove('hidden');

    // Update Nav Buttons styling (Desktop)
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('bg-white', 'text-yummy-brown', 'shadow-sm', 'ring-1', 'ring-black/5');
        b.classList.add('text-gray-400', 'hover:bg-white/40');
    });

    const btn = document.getElementById(`nav-${view}`);
    if (btn) {
        btn.classList.remove('text-gray-400', 'hover:bg-white/40');
        btn.classList.add('bg-white', 'text-yummy-brown', 'shadow-sm', 'ring-1', 'ring-black/5');
    }

    // Update Nav Buttons styling (Mobile)
    document.querySelectorAll('.nav-btn-m').forEach(b => {
        b.classList.remove('text-yummy-brown');
        b.classList.add('text-gray-400');
    });

    const btnM = document.getElementById(`nav-m-${view}`);
    if (btnM) {
        btnM.classList.remove('text-gray-400');
        btnM.classList.add('text-yummy-brown');
    }

    // Trigger view-specific renders
    if (view === 'dashboard') {
        renderCharts();
    } else if (view === 'productos') {
        renderProducts();
    } else if (view === 'clientes') {
        renderClientes();
    } else if (view === 'lista') {
        renderList();
    } else if (view === 'kanban') {
        renderKanban();
    } else if (view === 'produccion') {
        renderProduction();
    }
}

// ==========================================
// 🍎 PRODUCTOS CRUD
// ==========================================
async function renderProducts() {
    const tbody = document.getElementById('productos-list-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10"><i class="fas fa-spinner fa-spin text-4xl text-yummy-brown"></i></td></tr>`;

    try {
        const [products, categories] = await Promise.all([
            ProductsManager.loadProducts(),
            ProductsManager.loadCategories()
        ]);

        STATE.productsRaw = products;
        STATE.categories = categories;

        updateCategoryDropdowns();

        // Filter
        let displayProducts = products;
        if (STATE.productFilter !== 'all') {
            displayProducts = products.filter(p => p.categoria === STATE.productFilter);
        }

        if (displayProducts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-10 text-gray-400">
                        <i class="fas fa-box-open text-4xl mb-2"></i>
                        <p>No hay productos registrados.</p>
                    </td>
                </tr>
             `;
            return;
        }

        tbody.innerHTML = displayProducts.map(p => `
            <tr class="hover:bg-gray-50/50 transition-colors group">
                <td class="px-4 py-3">
                    <div class="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                        <img src="${p.imagen || 'https://via.placeholder.com/300x200?text=Sin+Imagen'}" 
                             alt="${p.nombre}" 
                             class="w-full h-full object-cover">
                    </div>
                </td>
                <td class="px-4 py-3">
                    <div class="font-bold text-gray-800 text-sm leading-tight">${p.nombre}</div>
                    <div class="text-[10px] text-gray-400 md:hidden uppercase font-bold mt-0.5">${p.categoria}</div>
                    <div class="text-[10px] text-gray-500 line-clamp-1 mt-1 font-medium">${p.descripcion || "Sin descripción"}</div>
                </td>
                <td class="px-4 py-3 hidden md:table-cell">
                    <span class="px-2 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-bold uppercase tracking-wider">${p.categoria}</span>
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="font-black text-yummy-brown text-sm">$${p.precio}</div>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="editarProducto('${p.id}')" 
                                class="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all"
                                title="Editar">
                            <i class="fas fa-edit text-xs"></i>
                        </button>
                        <button onclick="eliminarProducto('${p.id}', '${p.imagen}')" 
                                class="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                title="Eliminar">
                            <i class="fas fa-trash text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-10">Error al cargar productos</td></tr>';
    }
}

function updateCategoryDropdowns() {
    // 1. Filter Dropdown (Catálogo)
    const filterSelect = document.getElementById('filter-category');
    if (filterSelect) {
        const currentVal = filterSelect.value;
        filterSelect.innerHTML = '<option value="all">Todas las Categorías</option>' +
            STATE.categories.map(c => `<option value="${c.valor}">${c.nombre}</option>`).join('');
        filterSelect.value = currentVal;
    }

    // 2. Filter Dropdown (Cocina/Producción)
    const prodFilterSelect = document.getElementById('prod-filter-cat');
    if (prodFilterSelect) {
        const currentVal = prodFilterSelect.value;
        prodFilterSelect.innerHTML = '<option value="all">Todas las Categorías</option>' +
            STATE.categories.map(c => `<option value="${c.valor}">${c.nombre}</option>`).join('');
        prodFilterSelect.value = currentVal;
    }

    // 3. Form Dropdown (Producto)
    const formSelect = document.getElementById('prod-categoria');
    if (formSelect) {
        const currentVal = formSelect.value;
        formSelect.innerHTML = STATE.categories.map(c => `<option value="${c.valor}">${c.nombre}</option>`).join('');
        if (currentVal) formSelect.value = currentVal;
    }
}

window.filterProducts = function (val) {
    STATE.productFilter = val;
    renderProducts();
}

// Modal & Form Handling
window.abrirModalProducto = function (id = null) {
    const modal = document.getElementById('modal-producto');
    const form = document.getElementById('form-producto');

    form.reset();
    resetImagePreview();
    updateCategoryDropdowns();

    if (id) {
        document.getElementById('modal-title').innerText = 'Editar Producto';
        const p = STATE.productsRaw.find(x => x.id === id);
        if (p) {
            document.getElementById('prod-id').value = p.id;
            document.getElementById('prod-nombre').value = p.nombre;
            document.getElementById('prod-categoria').value = p.categoria;
            document.getElementById('prod-precio').value = p.precio;
            document.getElementById('prod-descripcion').value = p.descripcion || "";
            if (p.imagen) showImagePreview(p.imagen);
        }
    } else {
        document.getElementById('modal-title').innerText = 'Nuevo Producto';
        document.getElementById('prod-id').value = "";
    }

    modal.classList.remove('hidden');
}

window.cerrarModalProducto = function () {
    document.getElementById('modal-producto').classList.add('hidden');
}

window.editarProducto = function (id) {
    abrirModalProducto(id);
}

window.eliminarProducto = async function (id, imgUrl) {
    Swal.fire({
        title: '¿Eliminar producto?',
        text: "No podrás revertir esto",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                // Show loading
                Swal.fire({ title: 'Eliminando...', didOpen: () => Swal.showLoading() });

                await ProductsManager.deleteProduct(id, imgUrl);

                Swal.fire('Eliminado!', 'El producto ha sido eliminado.', 'success');
                renderProducts(); // Refresh
            } catch (error) {
                console.error(error);
                Swal.fire('Error', 'Hubo un problema al eliminar.', 'error');
            }
        }
    });
}

// Image handling
const fileInput = document.getElementById('prod-imagen');
if (fileInput) {
    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                showImagePreview(e.target.result);
            }
            reader.readAsDataURL(file);
        }
    });
}

function showImagePreview(src) {
    document.getElementById('img-preview').src = src;
    document.getElementById('img-preview-container').classList.remove('hidden');
    document.getElementById('img-placeholder').classList.add('hidden');
}

function resetImagePreview() {
    document.getElementById('img-preview').src = '';
    document.getElementById('img-preview-container').classList.add('hidden');
    document.getElementById('img-placeholder').classList.remove('hidden');
}
window.removeImage = function () {
    document.getElementById('prod-imagen').value = ""; // Clear input
    // If editing and had previous image, logic might be complex. 
    // For now, simple logic: if you remove, you are removing it from the form submit usage.
    // However, if we don't select a NEW file, we might want to keep the OLD URL.
    // If user clicks X, it means they want NO image or to Replace?
    // Let's assume X means clear preview. If it was an existing URL, we'd need a flag to say "delete image on save".
    // For simplicity v1: X just clears preview. If you save, if file input is empty but there was a previous URL, 
    // we need to know if we keep it or not. 
    // The current logic in Manager says: if imageFile provided, upload.
    // If NOT provided, we use productData.imagen from current form? 
    // NO, the form submit handler needs to handle this.

    // Let's make "Clear" just visually clear for now.
    resetImagePreview();
}

// Form Submit
const formProd = document.getElementById('form-producto');
if (formProd) {
    formProd.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('prod-id').value;
        const nombre = document.getElementById('prod-nombre').value;
        const categoria = document.getElementById('prod-categoria').value;
        const precio = document.getElementById('prod-precio').value;
        const descripcion = document.getElementById('prod-descripcion').value;
        const file = document.getElementById('prod-imagen').files[0];

        // Handling existing image logic
        let existingImg = "";
        if (id) {
            const p = STATE.productsRaw.find(x => x.id === id);
            if (p) existingImg = p.imagen;
        }

        // If preview is hidden, it means user removed image or there wasn't one.
        // If preview is showing a DATA URL (starts with data:), it's a new file.
        // If preview is showing a HTTP URL, it's the existing image.
        const previewSrc = document.getElementById('img-preview').src;
        const hasVisibleImage = !document.getElementById('img-preview-container').classList.contains('hidden');

        // If NO visible image, we want to save empty string (remove image).
        // If visible image IS existing URL, keep it.
        // If visible image is Data URL, we wait for ProductsManager to upload 'file'.

        let finalOldImage = "";
        if (hasVisibleImage) {
            if (previewSrc.startsWith('http')) finalOldImage = previewSrc;
            // if starts with data:, ignored here, 'file' will be used
        }

        const productData = {
            id: id || null,
            nombre,
            categoria,
            precio,
            descripcion,
            imagen: finalOldImage // Passed as fallback if no new file
        };

        try {
            // Show loading
            Swal.fire({
                title: 'Guardando...',
                text: 'Subiendo imagen y guardando datos',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            await ProductsManager.saveProduct(productData, file);

            Swal.fire({
                icon: 'success',
                title: 'Guardado',
                showConfirmButton: false,
                timer: 1500
            });

            cerrarModalProducto();
            renderProducts();

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'No se pudo guardar el producto', 'error');
        }
    });
}

// ==========================================
// 📂 CATEGORIAS MANAGEMENT logic
// ==========================================
window.abrirModalCategorias = async function () {
    const modal = document.getElementById('modal-categorias');
    modal.classList.remove('hidden');
    renderCategoriesList();
}

window.cerrarModalCategorias = function () {
    document.getElementById('modal-categorias').classList.add('hidden');
    // Refresh main view to update dropdowns in case changes happened
    if (STATE.productFilter !== 'all') { /* handle? */ }
    renderProducts(); // Reload to refresh dropdowns and potential category changes
}

async function renderCategoriesList() {
    const container = document.getElementById('lista-categorias');
    container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const cats = await ProductsManager.loadCategories();
        STATE.categories = cats; // Sync
        updateCategoryDropdowns();

        container.innerHTML = cats.map(c => `
            <div class="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-gray-700 capitalize text-sm">${c.nombre}</span>
                    <button onclick="eliminarCategoria('${c.id}')" 
                        class="text-red-400 hover:text-red-600 w-6 h-6 rounded flex items-center justify-center hover:bg-red-50">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
                <div class="flex gap-3 items-center">
                    <div class="flex items-center gap-1">
                        <span class="text-[10px] text-gray-400 font-bold uppercase">Orden:</span>
                        <input type="number" value="${c.orden || 0}" 
                            onchange="updateCatProp('${c.id}', 'orden', this.value)" 
                            class="w-12 text-xs p-1 border rounded outline-none focus:border-yummy-accent">
                    </div>
                    <label class="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" ${c.activo !== false ? 'checked' : ''} 
                            onchange="updateCatProp('${c.id}', 'activo', this.checked)" 
                            class="accent-yummy-brown w-4 h-4">
                        <span class="text-xs text-gray-500 group-hover:text-yummy-brown transition-colors">Visible</span>
                    </label>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-red-500 text-xs">Error al cargar</p>';
    }
}

window.updateCatProp = async function (id, prop, value) {
    const cat = STATE.categories.find(c => c.id === id);
    if (!cat) return;

    cat[prop] = prop === 'orden' ? parseInt(value) : value;

    try {
        await ProductsManager.saveCategory(cat);
        // Toast subtle feedback? 
        console.log(`Updated ${prop} for category ${id}`);
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo actualizar la propiedad', 'error');
    }
}

// Add Category Form
const formCat = document.getElementById('form-categoria');
if (formCat) {
    formCat.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('cat-nombre');
        const name = input.value.trim();
        if (!name) return;

        try {
            await ProductsManager.saveCategory({ nombre: name, orden: STATE.categories.length + 1, activo: true });
            input.value = "";
            renderCategoriesList();
            Swal.fire({
                icon: 'success',
                title: 'Categoría Agregada',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 1500
            });
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo guardar la categoría', 'error');
        }
    });
}

window.eliminarCategoria = async function (id) {
    Swal.fire({
        title: '¿Eliminar?',
        text: "Desaparecerá de las opciones.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await ProductsManager.deleteCategory(id);
                renderCategoriesList();
            } catch (e) {
                console.error(e);
            }
        }
    });
}

window.setDateRange = function (days) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);

    STATE.range.start = start.toISOString().split('T')[0];
    STATE.range.end = end.toISOString().split('T')[0];

    aplicarFiltros();
}

function formatDateDDMM(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}`;
}

// Helpers
function setupEventListeners() {
    // Drag & Drop Kanban (SortableJS)
    ['pendiente', 'horneando', 'entregado', 'finalizado'].forEach(id => {
        const el = document.getElementById(`col-${id}`);
        if (el) {
            new Sortable(el, {
                group: 'kanban',
                animation: 150,
                onEnd: function (evt) {
                    const idPedido = evt.item.getAttribute('data-id');
                    const newStatus = evt.to.id.replace('col-', '');
                    // Capitalize
                    const stMap = { 'pendiente': 'Pendiente', 'horneando': 'Horneando', 'entregado': 'Entregado', 'finalizado': 'Finalizado' };
                    updateStatus(idPedido, stMap[newStatus]);
                }
            });
        }
    });

    // Date inputs (Desktop & Mobile)
    const d1 = document.getElementById('date-start');
    const d2 = document.getElementById('date-end');
    const d1m = document.getElementById('date-start-m');
    const d2m = document.getElementById('date-end-m');

    const updateAll = (start, end) => {
        STATE.range.start = start;
        STATE.range.end = end;
        if (d1) d1.value = start;
        if (d1m) d1m.value = start;
        if (d2) d2.value = end;
        if (d2m) d2m.value = end;
        aplicarFiltros();
    };

    if (d1) d1.value = STATE.range.start;
    if (d1m) d1m.value = STATE.range.start;
    if (d2) d2.value = STATE.range.end;
    if (d2m) d2m.value = STATE.range.end;

    if (d1) d1.onchange = () => updateAll(d1.value, STATE.range.end);
    if (d1m) d1m.onchange = () => updateAll(d1m.value, STATE.range.end);
    if (d2) d2.onchange = () => updateAll(STATE.range.start, d2.value);
    if (d2m) d2m.onchange = () => updateAll(STATE.range.start, d2m.value);

    // Pin Pad Listeners (Click)
    document.querySelectorAll('.pin-btn[data-num]').forEach(btn => {
        btn.onclick = () => addPin(btn.dataset.num);
    });
    const btnClear = document.getElementById('btn-clear');
    if (btnClear) btnClear.onclick = clearPin;

    const btnEnter = document.getElementById('btn-enter');
    if (btnEnter) btnEnter.onclick = checkPin;

    // Keyboard support for PIN
    window.addEventListener('keydown', (e) => {
        if (!STATE.isLogged) {
            if (e.key >= '0' && e.key <= '9') {
                addPin(e.key);
            } else if (e.key === 'Backspace') {
                clearPin();
            } else if (e.key === 'Enter') {
                checkPin();
            }
        }
    });

}
// ==========================================
// 🍬 TOPPINGS MANAGEMENT
// ==========================================
async function abrirModalToppings() {
    document.getElementById('modal-toppings').classList.remove('hidden');

    // Fill category select
    const sel = document.getElementById('top-categoria-select');
    sel.innerHTML = '<option value="">Selecciona Categoría</option>' +
        STATE.categories.map(c => `<option value="${c.valor}">${c.nombre}</option>`).join('');

    renderToppingsList();
}

function cerrarModalToppings() {
    document.getElementById('modal-toppings').classList.add('hidden');
}

async function renderToppingsList() {
    const container = document.getElementById('lista-toppings-container');
    container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const toppings = await ProductsManager.loadToppings();

        if (toppings.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">No hay toppings registrados.</p>';
            return;
        }

        // Group by category
        const grouped = {};
        toppings.forEach(t => {
            if (!grouped[t.categoria]) grouped[t.categoria] = [];
            grouped[t.categoria].push(t);
        });

        container.innerHTML = Object.entries(grouped).map(([catId, items]) => {
            const catName = STATE.categories.find(c => c.valor === catId)?.nombre || catId;
            return `
                <div class="space-y-2">
                    <h4 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b pb-1">${catName}</h4>
                    <div class="grid grid-cols-1 gap-2">
                        ${items.map(t => `
                            <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                <div>
                                    <span class="text-xs font-bold text-gray-700">${t.nombre}</span>
                                    <span class="text-[10px] text-yummy-brown ml-2">$${t.precio}</span>
                                </div>
                                <button onclick="eliminarTopping('${t.id}')" class="text-red-400 hover:text-red-600 transition-colors">
                                    <i class="fas fa-trash-alt text-xs"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-red-500 text-xs text-center">Error al cargar toppings</p>';
    }
}

const formTopping = document.getElementById('form-topping');
if (formTopping) {
    formTopping.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            nombre: document.getElementById('top-nombre').value,
            precio: document.getElementById('top-precio').value,
            categoria: document.getElementById('top-categoria-select').value
        };

        try {
            await ProductsManager.saveTopping(data);
            formTopping.reset();
            renderToppingsList();
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo guardar el topping', 'error');
        }
    });
}

window.eliminarTopping = async function (id) {
    const result = await Swal.fire({
        title: '¿Eliminar topping?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            await ProductsManager.deleteTopping(id);
            renderToppingsList();
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo eliminar', 'error');
        }
    }
}
// ==========================================
// 👥 CLIENTES CRUD & CRM
// ==========================================
async function renderClientes() {
    const tbody = document.getElementById('clientes-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10"><i class="fas fa-spinner fa-spin mr-2"></i>Cargando directorio...</td></tr>';

    try {
        const querySnapshot = await getDocs(query(collection(db, "clientes"), orderBy("ultimoPedido", "desc")));
        const clientes = [];
        querySnapshot.forEach(doc => clientes.push({ id: doc.id, ...doc.data() }));

        if (clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-gray-400">No hay clientes registrados aún.</td></tr>';
            return;
        }

        tbody.innerHTML = clientes.map(c => `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="font-bold text-gray-800">${c.nombre || 'Sin nombre'}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-xs font-medium text-gray-700">${c.email}</div>
                    <div class="text-[10px] text-gray-400 font-bold tracking-wider uppercase">${c.tel || '-'}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-[10px] text-gray-500">${formatDateFull(c.primerPedido)}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-xs font-bold text-yummy-brown">${formatDateFull(c.ultimoPedido)}</div>
                </td>
            </tr>
        `).join('');

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-red-500">Error al cargar clientes.</td></tr>';
    }
}

function formatDateFull(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ==========================================
// 📊 EXCEL EXPORT (SHEETJS)
// ==========================================
async function exportPedidosExcel() {
    Swal.fire({ title: 'Generando Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // Preparar Datos Aplanados
        const dataReporte = STATE.pedidosRaw.map(p => ({
            "ID Pedido": p.id,
            "Fecha": p.fecha,
            "Hora": p.hora,
            "Cliente": p.cliente,
            "Teléfono": p.tel || "N/A",
            "Dirección": p.direccion || "Recoger en tienda",
            "Método": p.metodo.toUpperCase(),
            "Pago": p.pago.toUpperCase(),
            "Estatus": p.estatus.toUpperCase(),
            "Total": p.total,
            "Productos": p.itemsArray.map(i => `${i.cantidad}x ${i.nombre}`).join(' | '),
            "Observaciones": p.observaciones || ""
        }));

        const ws = XLSX.utils.json_to_sheet(dataReporte);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Pedidos");

        // Descargar
        XLSX.writeFile(wb, `Pedidos_Yummy_${new Date().toISOString().split('T')[0]}.xlsx`);

        Swal.fire('¡Éxito!', 'Reporte de pedidos descargado.', 'success');
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo generar el Excel.', 'error');
    }
}

async function exportClientesExcel() {
    Swal.fire({ title: 'Generando Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const querySnapshot = await getDocs(collection(db, "clientes"));
        const clientes = [];
        querySnapshot.forEach(doc => {
            const d = doc.data();
            clientes.push({
                "Nombre": d.nombre || "Sin nombre",
                "Email": d.email,
                "Teléfono": d.tel || "N/A",
                "Primer Pedido": d.primerPedido,
                "Último Pedido": d.ultimoPedido
            });
        });

        if (clientes.length === 0) {
            Swal.fire('Info', 'No hay clientes para exportar.', 'info');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(clientes);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Clientes");

        XLSX.writeFile(wb, `Clientes_Yummy_${new Date().toISOString().split('T')[0]}.xlsx`);

        Swal.fire('¡Éxito!', 'Directorio de clientes descargado.', 'success');
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo generar el Excel.', 'error');
    }
}

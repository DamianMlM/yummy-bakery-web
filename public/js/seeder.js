import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Helper to clean Google Drive URLs
const cleanUrl = (url) => {
    if (!url) return "https://via.placeholder.com/150?text=Sin+Foto";
    // Extraer ID de la URL larga 
    // Format: https://drive.google.com/file/d/1ow9IsvjzXLZIbwI9GxH0j_769r0x7BOo/view?usp=drive_link
    const match = url.match(/\/d\/(.+?)\//);
    if (match && match[1]) {
        return `https://drive.google.com/uc?export=view&id=${match[1]}`;
    }
    return url;
};

// CATALOGO INICIAL (Basado en el sistema anterior)
// NOTA: Puedes editar esta lista antes de correr el seeder si faltan productos.
const productos = [
    { id: "R-01", categoria: "Roles", nombre: "Rol Mermelada Fresa", precio: 45, descripcion: "Casera", relleno: false, imagen: "https://drive.google.com/file/d/1ow9IsvjzXLZIbwI9GxH0j_769r0x7BOo/view?usp=drive_link" },
    { id: "R-02", categoria: "Roles", nombre: "Rol Galleta Oreo", precio: 45, descripcion: "Clásico", relleno: false, imagen: "https://drive.google.com/file/d/18snnH58-HoAqTxialjgxkk9tSPoTa78b/view?usp=drive_link" },
    { id: "R-03", categoria: "Roles", nombre: "Rol Crema Avellanas", precio: 45, descripcion: "Delicioso", relleno: false, imagen: "https://drive.google.com/file/d/12enX57B4mNrokP_Hhb5RcjeUlLmyYu3w/view?usp=drive_link" },
    { id: "R-04", categoria: "Roles", nombre: "Rol Tres Leches", precio: 45, descripcion: "Húmedo", relleno: false, imagen: "https://drive.google.com/file/d/14HJ3XRpJs7PDlnIagD07Ix-ojtfrt5rq/view?usp=drive_link" },
    { id: "R-05", categoria: "Roles", nombre: "Rol Manzana Canela", precio: 45, descripcion: "Especial", relleno: false, imagen: "https://drive.google.com/file/d/1yEVQ4hvTl8otrus_5KoYNCEcmoPjJ5ri/view?usp=drive_link" },
    { id: "R-06", categoria: "Roles", nombre: "Rol Rollcha", precio: 45, descripcion: "Cobertura de concha", relleno: false, imagen: "https://drive.google.com/file/d/1Yss-Oguoq-3lIIHDS63txejH_p4kDoN3/view?usp=drive_link" },
    { id: "R-07", categoria: "Roles", nombre: "Rol Lotus", precio: 50, descripcion: "Premium", relleno: false, imagen: "https://drive.google.com/file/d/1CWGyiS1-k6sTNemWjlT9YduN-TCCPl-N/view?usp=drive_link" },
    { id: "R-08", categoria: "Roles", nombre: "Rol Pistache", precio: 60, descripcion: "Premium", relleno: false, imagen: "https://drive.google.com/file/d/1cbdEw2hEiGyP2tQtCnoIet8lPTFzl2ns/view?usp=drive_link" },
    { id: "C-TRA-01", categoria: "Conchas", nombre: "Concha Vainilla", precio: 25, descripcion: "Tradicional", relleno: true, imagen: "https://drive.google.com/file/d/1r3pN7G9BrOTg2kxKQy1UyowrrFH6KIZr/view?usp=drive_link" },
    { id: "C-TRA-02", categoria: "Conchas", nombre: "Concha Chocolate", precio: 25, descripcion: "Tradicional", relleno: true, imagen: "https://drive.google.com/file/d/1NN24JtMTvhRVPcQuPJLXGc-W3_vx0cH_/view?usp=drive_link" },
    { id: "C-TRA-03", categoria: "Conchas", nombre: "Concha Oreo", precio: 25, descripcion: "Tradicional", relleno: true, imagen: "https://drive.google.com/file/d/15COFqCrsVs-nAdJKD1CMRgds9wnrqiB-/view?usp=drive_link" },
    { id: "C-TRA-04", categoria: "Conchas", nombre: "Concha Kranky", precio: 25, descripcion: "Tradicional", relleno: true, imagen: "https://drive.google.com/file/d/1BrX3adhAQXY3A-Rot6ezT2bDry9_unjz/view?usp=drive_link" },
    { id: "C-ESP-01", categoria: "Conchas", nombre: "Concha Kinder Bueno", precio: 28, descripcion: "Especial", relleno: true, imagen: "https://drive.google.com/file/d/1vIHJkNfutE8CK-IOhQLPJoumrYfNv72H/view?usp=drive_link" },
    { id: "C-ESP-02", categoria: "Conchas", nombre: "Concha Lotus", precio: 28, descripcion: "Especial", relleno: true, imagen: "https://drive.google.com/file/d/1paebpNKVoXoxGZckVV0AI_0Cy4QwYAEy/view?usp=drive_link" },
    { id: "C-ESP-03", categoria: "Conchas", nombre: "Concha Elote", precio: 28, descripcion: "Especial", relleno: true, imagen: "" },
    { id: "P-MIN-01", categoria: "Paquetes", nombre: "Paquete Mini Tradicional", precio: 60, descripcion: "Vainilla, chocolate, oreo y kínder", relleno: true, imagen: "https://drive.google.com/file/d/11WhAeuLMzHWfC6jJeS_88vBOgztzSaK6/view?usp=drive_link" },
    { id: "P-MIN-02", categoria: "Paquetes", nombre: "Paquete Mini Personalizado", precio: 70, descripcion: "A elección", relleno: true, imagen: "https://drive.google.com/file/d/1Ak_qgRMEfWm_bo0fp8_D7nJ3umaFHUwG/view?usp=drive_link" }
];

async function wipeDatabase() {
    console.log("🧹 Limpiando base de datos...");
    const productsSnapshot = await getDocs(collection(db, "productos"));
    const categoriesSnapshot = await getDocs(collection(db, "categorias"));

    const batch = writeBatch(db);
    productsSnapshot.forEach((doc) => batch.delete(doc.ref));
    categoriesSnapshot.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
    console.log("✨ Base de datos limpia.");
}

async function seedDatabase() {
    if (!confirm("⚠️ ESTO BORRARÁ TODOS LOS PRODUCTOS Y CATEGORÍAS ACTUALES.\n¿Estás seguro de continuar?")) return;

    try {
        await wipeDatabase();

        console.log("🚀 Iniciando migración a Firestore...");
        const batch = writeBatch(db);

        // 1. Categorias consolidadas
        const categoriasUnicas = [...new Set(productos.map(p => p.categoria))];
        console.log(`📂 Creando ${categoriasUnicas.length} categorías...`);

        categoriasUnicas.forEach(catName => {
            const id = catName.toLowerCase().replace(/\s+/g, '-');
            const docRef = doc(db, "categorias", id);
            batch.set(docRef, { nombre: catName, valor: id });
        });

        // 2. Productos
        console.log(`📦 Preparando ${productos.length} productos...`);
        productos.forEach(p => {
            // Use provided ID or auto-gen? User provided IDs like R-01. Let's use them as Doc ID for easier ref.
            const docRef = doc(db, "productos", p.id);
            const pClean = {
                nombre: p.nombre,
                categoria: p.categoria.toLowerCase().replace(/\s+/g, '-'), // Link to cat ID
                precio: parseFloat(p.precio),
                descripcion: p.descripcion,
                relleno: p.relleno,
                imagen: cleanUrl(p.imagen),
                activo: true
            };
            batch.set(docRef, pClean);
        });

        await batch.commit();
        console.log("✅ Migración completada exitosamente!");
        alert("Base de datos actualizada con el nuevo catálogo.");
        location.reload();
    } catch (error) {
        console.error("❌ Error al guardar en Firestore:", error);
        alert("Error: " + error.message);
    }
}

async function seedOrders() {
    console.log("🚀 Generando pedidos de prueba...");
    const batch = writeBatch(db);

    const estados = ["Pendiente", "Horneando", "Entregado", "Finalizado"];
    const metodos = ["recoger", "envio"];
    const pagos = ["efectivo", "transferencia"];
    const nombres = ["Ana", "Carlos", "Sofia", "Miguel", "Lucia", "Jorge", "Elena", "Roberto", "Maria", "Pedro"];

    // Generar 50 pedidos en Enero 2026
    for (let i = 0; i < 50; i++) {
        const docRef = doc(collection(db, "pedidos"));

        // Random Date in Jan 2026
        const day = Math.floor(Math.random() * 31) + 1;
        const hour = Math.floor(Math.random() * 12) + 9; // 9am - 9pm
        const date = new Date(2026, 0, day, hour, Math.floor(Math.random() * 60));

        // Random Items
        const numItems = Math.floor(Math.random() * 4) + 1; // 1-4 items
        const items = [];
        let total = 0;

        for (let j = 0; j < numItems; j++) {
            const p = productos[Math.floor(Math.random() * productos.length)];
            const qty = Math.floor(Math.random() * 3) + 1;
            const sub = p.precio * qty;
            items.push({
                categoria: p.categoria.toLowerCase().replace(/\s+/g, '-'), // Normalize to match DB
                nombre: p.nombre,
                precioBase: p.precio,
                cantidad: qty,
                subtotal: sub,
                extrasTexto: Math.random() > 0.7 ? "Con Extra" : ""
            });
            total += sub;
        }

        const metodo = metodos[Math.floor(Math.random() * metodos.length)];
        if (metodo === 'envio') total += 10;

        batch.set(docRef, {
            fecha: date.toISOString(),
            cliente: {
                nombre: nombres[Math.floor(Math.random() * nombres.length)] + " Test",
                tel: "5555555555",
                direccion: "Calle Falsa 123",
                email: "test@example.com"
            },
            metodo: metodo,
            pago: pagos[Math.floor(Math.random() * pagos.length)],
            estatus: estados[Math.floor(Math.random() * estados.length)],
            items: items,
            total: total,
            observaciones: "Pedido de prueba generado"
        });
    }

    try {
        await batch.commit();
        console.log("✅ 50 Pedidos generados exitosamente!");
        alert("Pedidos de prueba generados.");
        location.reload();
    } catch (error) {
        console.error("Error generating orders:", error);
        alert("Error: " + error.message);
    }
}


async function cleanupGhostData() {
    console.log("🧹 Iniciando limpieza de datos fantasma...");
    const validCats = ["roles", "conchas", "paquetes"];
    const batch = writeBatch(db);

    try {
        // 1. Limpiar Categorías
        const categoriesSnapshot = await getDocs(collection(db, "categorias"));
        categoriesSnapshot.forEach((doc) => {
            if (!validCats.includes(doc.id)) {
                console.log(`🗑️ Eliminando categoría: ${doc.id}`);
                batch.delete(doc.ref);
            }
        });

        // 2. Limpiar Productos
        const productsSnapshot = await getDocs(collection(db, "productos"));
        productsSnapshot.forEach((doc) => {
            const data = doc.data();
            if (!validCats.includes(data.categoria)) {
                console.log(`🗑️ Eliminando producto: ${data.nombre} (${data.categoria})`);
                batch.delete(doc.ref);
            }
        });

        // 3. Limpiar Pedidos (Opcional, pero recomendado si son de prueba)
        const ordersSnapshot = await getDocs(collection(db, "pedidos"));
        ordersSnapshot.forEach((doc) => {
            const data = doc.data();
            const hasGhostItem = data.items.some(item => !validCats.includes(item.categoria?.toLowerCase().replace(/\s+/g, '-')));
            if (hasGhostItem) {
                console.log(`🗑️ Eliminando pedido con datos fantasma: ${doc.id}`);
                batch.delete(doc.ref);
            }
        });

        await batch.commit();
        console.log("✨ Limpieza completada.");
        alert("Limpieza completada exitosamente.");
        location.reload();
    } catch (error) {
        console.error("❌ Error en la limpieza:", error);
        alert("Error: " + error.message);
    }
}

async function cleanupOrders() {
    const result = await Swal.fire({
        title: '⚠️ ¿Eliminar TODOS los pedidos?',
        text: 'Esta acción NO se puede deshacer. Se borrarán todos los pedidos de la base de datos.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar todo',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    console.log("🧹 Limpiando todos los pedidos...");

    try {
        const ordersSnapshot = await getDocs(collection(db, "pedidos"));

        if (ordersSnapshot.empty) {
            Swal.fire('Info', 'No hay pedidos para eliminar.', 'info');
            return;
        }

        const batch = writeBatch(db);
        let count = 0;

        ordersSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
            count++;
        });

        await batch.commit();

        console.log(`✅ ${count} pedidos eliminados exitosamente.`);
        Swal.fire({
            icon: 'success',
            title: '¡Listo!',
            text: `Se eliminaron ${count} pedidos de la base de datos.`,
            timer: 2000
        });

        location.reload();
    } catch (error) {
        console.error("❌ Error al eliminar pedidos:", error);
        Swal.fire('Error', 'No se pudieron eliminar los pedidos: ' + error.message, 'error');
    }
}

export { seedDatabase, seedOrders, cleanupGhostData, cleanupOrders };


import { db, storage } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

export const ProductsManager = {
    async loadProducts() {
        const querySnapshot = await getDocs(collection(db, "productos"));
        const products = [];
        querySnapshot.forEach((doc) => {
            products.push({ id: doc.id, ...doc.data() });
        });
        return products;
    },

    async uploadImage(file) {
        if (!file) return null;
        try {
            const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error("Error uploading image:", error);
            throw error;
        }
    },

    async saveProduct(productData, imageFile) {
        try {
            let imageUrl = productData.imagen;

            if (imageFile) {
                imageUrl = await this.uploadImage(imageFile);
            }

            const cleanData = {
                nombre: productData.nombre,
                descripcion: productData.descripcion || "",
                precio: parseFloat(productData.precio),
                categoria: productData.categoria,
                imagen: imageUrl || "",
                activo: true
            };

            if (productData.id) {
                // Update
                const productRef = doc(db, "productos", productData.id);
                await updateDoc(productRef, cleanData);
                return { id: productData.id, ...cleanData };
            } else {
                // Create
                // Use formatted ID or auto-gen? Using name-based ID for cleaner URLs matches user preference usually
                const newId = productData.nombre.toLowerCase().replace(/\s+/g, '-');
                const productRef = doc(db, "productos", newId);
                await setDoc(productRef, cleanData);
                return { id: newId, ...cleanData };
            }
        } catch (error) {
            console.error("Error saving product:", error);
            throw error;
        }
    },

    async deleteProduct(productId, imageUrl) {
        try {
            // Delete Firestore doc
            await deleteDoc(doc(db, "productos", productId));

            // Optional: Delete image from Storage if it exists and is not a placeholder
            if (imageUrl && imageUrl.includes('firebasestorage')) {
                try {
                    // Extract path from URL roughly or store ref
                    const storageRef = ref(storage, imageUrl);
                    await deleteObject(storageRef);
                } catch (e) {
                    console.warn("Could not delete image or not a storage image", e);
                }
            }
        } catch (error) {
            console.error("Error deleting product:", error);
            throw error;
        }
    },

    // ==========================================
    // 📂 CATEGORIAS CRUD
    // ==========================================
    async loadCategories() {
        try {
            const querySnapshot = await getDocs(collection(db, "categorias"));
            const categories = [];
            querySnapshot.forEach((doc) => {
                categories.push({ id: doc.id, ...doc.data() });
            });
            // Sort by 'orden'
            categories.sort((a, b) => (a.orden || 0) - (b.orden || 0));

            // If empty, return default structure or empty array
            if (categories.length === 0) {
                return [
                    { id: 'panes', nombre: 'Panes', valor: 'panes', orden: 1, activo: true },
                    { id: 'pasteles', nombre: 'Pasteles', valor: 'pasteles', orden: 2, activo: true },
                    { id: 'galletas', nombre: 'Galletas', valor: 'galletas', orden: 3, activo: true },
                    { id: 'bebidas', nombre: 'Bebidas', valor: 'bebidas', orden: 4, activo: true },
                    { id: 'otros', nombre: 'Otros', valor: 'otros', orden: 5, activo: true }
                ];
            }
            return categories;
        } catch (e) {
            console.error("Error loading categories:", e);
            return [];
        }
    },

    async saveCategory(categoryData) {
        try {
            const id = categoryData.id || categoryData.nombre.toLowerCase().replace(/\s+/g, '-');
            const data = {
                nombre: categoryData.nombre,
                valor: id,
                orden: parseInt(categoryData.orden) || 0,
                activo: categoryData.activo !== undefined ? categoryData.activo : true
            };
            await setDoc(doc(db, "categorias", id), data);
            return { id, ...data };
        } catch (error) {
            console.error("Error saving category:", error);
            throw error;
        }
    },

    async deleteCategory(id) {
        try {
            await deleteDoc(doc(db, "categorias", id));
        } catch (error) {
            console.error("Error deleting category:", error);
            throw error;
        }
    },

    // ==========================================
    // 🍬 TOPPINGS (EXTRAS) CRUD
    // ==========================================
    async loadToppings() {
        try {
            const querySnapshot = await getDocs(collection(db, "toppings"));
            const toppings = [];
            querySnapshot.forEach((doc) => {
                toppings.push({ id: doc.id, ...doc.data() });
            });
            return toppings;
        } catch (e) {
            console.error("Error loading toppings:", e);
            return [];
        }
    },

    async saveTopping(toppingData) {
        try {
            const id = toppingData.id || `top-${Date.now()}`;
            const data = {
                nombre: toppingData.nombre,
                precio: parseFloat(toppingData.precio) || 0,
                categoria: toppingData.categoria, // Link to category ID
                activo: toppingData.activo !== undefined ? toppingData.activo : true
            };
            await setDoc(doc(db, "toppings", id), data);
            return { id, ...data };
        } catch (error) {
            console.error("Error saving topping:", error);
            throw error;
        }
    },

    async deleteTopping(id) {
        try {
            await deleteDoc(doc(db, "toppings", id));
        } catch (error) {
            console.error("Error deleting topping:", error);
            throw error;
        }
    }
};

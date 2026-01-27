# Yummy Bakery 🥐✨

Plataforma de gestión y tienda en línea para una repostería premium.

## 🚀 Características
- **Admin Dashboard**: Gestión de pedidos vía Kanban, Lista y Plan de Producción.
- **Catálogo Dinámico**: CRUD de productos, categorías y toppings.
- **Reporting**: Exportación de pedidos y clientes a Excel (.xlsx).
- **Backend**: Firebase Firestore, Storage y Cloud Functions (Node.js).
- **Notificaciones**: Avisos automáticos por Email (SMTP/Gmail).

## 🛠️ Configuración para Desarrolladores

Para proteger la privacidad, las claves no están incluidas en el repositorio. Sigue estos pasos para configurar tu entorno:

### 1. Variables de Entorno
Copia el archivo `.env.template` a un nuevo archivo `.env` y completa tus datos:
```bash
cp .env.template .env
```

### 2. Firebase
- Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
- Habilita **Firestore**, **Storage** y **Hosting**.
- Copia tu configuración web en `public/js/firebase-config.js`.

### 3. Google Apps Script
- Si usas el backend de Google Sheets, implementa tu script como Aplicación Web y pega la URL en `public/js/config.js`.

### 4. Cloud Functions
Instala dependencias y despliega:
```bash
cd functions
npm install
firebase deploy --only functions
```

## 🔒 Seguridad
- **config.js** y **MAINTENANCE.md** están excluidos por `.gitignore`.
- El acceso al panel de Admin requiere un **PIN de 4 dígitos** (Hashed en el cliente).

## 📄 Licencia
Privado - Propiedad de Yummy Bakery.

// IMPORTANT: Never commit this file with real keys to a public repository.
// For production, consider using a build process to inject environment variables.
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyD9TuibCbTP8DPDwZpc0mUjnciP813bqgQ",
    authDomain: "yummi-bakery.firebaseapp.com",
    projectId: "yummi-bakery",
    storageBucket: "yummi-bakery.firebasestorage.app",
    messagingSenderId: "897934262140",
    appId: "1:897934262140:web:006d487d4bdd562ec9aef9",
    measurementId: "G-56F2YWNQTL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };

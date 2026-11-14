import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-storage.js";

// Firebase web app configuration for Diamond Lounge.
const firebaseConfig = {
    apiKey: "AIzaSyCyYt66fWu-jMN8PrU6SA7eEZ0XBIYl9to",
    authDomain: "diamond-lounge-7caf6.firebaseapp.com",
    projectId: "diamond-lounge-7caf6",
    storageBucket: "diamond-lounge-7caf6.firebasestorage.app",
    messagingSenderId: "773006638410",
    appId: "1:773006638410:web:f39a00e63b494cd7f015b3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

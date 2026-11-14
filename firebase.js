import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-storage.js";

// Firebase Console → Project settings → General → Your apps → Web app → SDK setup.
// This is the existing Diamond Lounge web-app configuration. Firebase web API
// keys identify the project; access is controlled by Authentication and rules.
const firebaseConfig = {
    apiKey: "AIzaSyCyYt66fWu-jMN8PrU6SA7eEZ0XBIYl9to",
    authDomain: "diamond-lounge-7caf6.firebaseapp.com",
    projectId: "diamond-lounge-7caf6",
    storageBucket: "diamond-lounge-7caf6.firebasestorage.app",
    messagingSenderId: "773006638410",
    appId: "1:773006638410:web:f39a00e63b494cd7f015b3"
};

const requiredConfig = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
const missingConfig = requiredConfig.filter((key) => {
    const value = firebaseConfig[key];
    return typeof value !== "string" || !value || value.includes("YOUR_");
});

if (missingConfig.length) {
    throw new Error(`Firebase configuration is incomplete. Add these values in firebase.js: ${missingConfig.join(", ")}`);
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

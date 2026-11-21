import {
  getApp,
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCyYt66fWu-jMN8PrU6SA7eEZ0XBIYl9to",
  authDomain: "diamond-lounge-7caf6.firebaseapp.com",
  projectId: "diamond-lounge-7caf6",
  messagingSenderId: "773006638410",
  appId: "1:773006638410:web:f39a00e63b494cd7f015b3"
};

const requiredConfig = [
  "apiKey",
  "authDomain",
  "projectId",
  "messagingSenderId",
  "appId"
];

const missingConfig = requiredConfig.filter(
  (key) => !firebaseConfig[key] ||
    firebaseConfig[key].includes("YOUR_")
);

if (missingConfig.length > 0) {
  throw new Error(
    `Missing Firebase configuration: ${missingConfig.join(", ")}`
  );
}

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

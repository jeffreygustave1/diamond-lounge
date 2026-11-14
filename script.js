import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const currentUser =
    localStorage.getItem("diamondUsername") ||
    "Member";

const firebaseConfig =
    window.firebaseConfig;

const app =
    initializeApp(firebaseConfig);

const db =
    getFirestore(app);

const messagesRef =
    collection(
        db,
        "messages"
    );

window.onload = function () {

    const profileName =
        document.getElementById(
            "profileName"
        );

    if (profileName) {

        profileName.textContent =
            "💎 " + currentUser;

    }

    const currentUserElement =
        document.getElementById(
            "currentUser"
        );

    if (currentUserElement) {

        currentUserElement.textContent =
            "🟢 " + currentUser;

    }

};

let chatLoaded = false;

const messagesContainer =
    document.getElementById(
        "messages"
    );

const messagesQuery =
    query(
        messagesRef,
        orderBy(
            "timestamp"
        )
    );

onSnapshot(
    messagesQuery,
    function(snapshot){

        if(!messagesContainer){
            return;
        }

        messagesContainer.innerHTML = "";

        snapshot.forEach(function(doc){

            const data =
                doc.data();

        
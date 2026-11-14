
import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

let currentUser = "Member";
let currentUid = null;
let chatReady = false;

const messagesElement = document.getElementById("messages");
const input = document.getElementById("messageInput");

// Firebase authentication
onAuthStateChanged(auth, (user) => {

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUid = user.uid;
    currentUser = user.displayName || user.email || "Member";

    const profileName = document.getElementById("profileName");
    const currentUserElement = document.getElementById("currentUser");

    if (profileName) {
        profileName.textContent = "💎 " + currentUser;
    }

    if (currentUserElement) {
        currentUserElement.textContent = "🟢 " + currentUser;
    }

    if (!chatReady) {
        chatReady = true;
        loadMessages();
    }

});

// REAL-TIME FIRESTORE MESSAGES
function loadMessages() {

    const messagesRef = collection(db, "messages");

    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "asc"),
        limit(100)
    );

    onSnapshot(messagesQuery, (snapshot) => {

        messagesElement.innerHTML = "";

        snapshot.forEach((documentSnapshot) => {

            const data = documentSnapshot.data();

            const message = document.createElement("div");
            message.className = "message";

            const author = document.createElement("strong");
            author.textContent = (data.username || "Member") + ": ";

            const messageText = document.createTextNode(data.text || "");

            message.appendChild(author);
            message.appendChild(messageText);

            messagesElement.appendChild(message);

        });

        messagesElement.scrollTop = messagesElement.scrollHeight;

    }, (error) => {

        console.error("Firestore error:", error);

        messagesElement.textContent =
            "Unable to load messages. Please check your connection.";

    });

}

// SEND MESSAGE TO FIRESTORE
window.sendMessage = async function () {

    if (!currentUid) return;

    const text = input.value.trim();

    if (!text) return;

    if (text.length > 2000) {
        alert("Messages cannot exceed 2000 characters.");
        return;
    }

    try {

        await addDoc(collection(db, "messages"), {

            uid: currentUid,
            username: currentUser,
            text: text,
            timestamp: serverTimestamp()

        });

        input.value = "";
        input.focus();

    } catch (error) {

        console.error("Message error:", error);

        alert("Message could not be sent. Please try again.");

    }

};

// CLOUD CHAT IS SHARED.
// This button does not delete messages from Firebase.
window.clearChat = function () {

    alert("Cloud messages are shared with everyone and cannot be cleared from this button.");

};

// FIREBASE LOGOUT
window.logout = async function () {

    try {

        await signOut(auth);
        window.location.href = "login.html";

    } catch (error) {

        console.error("Logout error:", error);
        alert("Unable to log out.");

    }

};

// ENTER TO SEND
if (input) {

    input.addEventListener("keydown", (event) => {

        if (event.key === "Enter") {
            window.sendMessage();
        }

    });

}

// VOICE CHANNEL SELECTION
document.querySelectorAll(".voice-channel").forEach(channel => {

    channel.addEventListener("click", () => {

        document.querySelectorAll(".voice-channel").forEach(item => {
            item.classList.remove("active");
        });

        channel.classList.add("active");

    });

});

console.log("Diamond Lounge Real-Time Chat Ready 💎");

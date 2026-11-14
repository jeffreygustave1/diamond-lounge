import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
    addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const messagesElement = document.getElementById("messages");
const input = document.getElementById("messageInput");
const messageForm = document.getElementById("messageForm");
let currentUser = "Member";
let currentUid = null;
let chatReady = false;

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUid = user.uid;
    currentUser = user.displayName || user.email || "Member";
    const profileName = document.getElementById("profileName");
    const currentUserElement = document.getElementById("currentUser");
    if (profileName) profileName.textContent = currentUser;
    if (currentUserElement) {
        const name = currentUserElement.querySelector("span");
        if (name) name.textContent = currentUser;
        else currentUserElement.textContent = "🟢 " + currentUser;
    }
    if (!chatReady) {
        chatReady = true;
        loadMessages();
    }
});

function appendAttachment(message, attachment) {
    if (!attachment || typeof attachment.url !== "string" || !attachment.url.startsWith("https://firebasestorage.googleapis.com/")) return;
    const type = typeof attachment.type === "string" ? attachment.type : "";
    let preview;
    if (type.startsWith("image/")) {
        preview = document.createElement("img");
        preview.alt = attachment.name || "Shared image";
        preview.loading = "lazy";
    } else if (type.startsWith("video/")) {
        preview = document.createElement("video");
        preview.controls = true;
        preview.preload = "metadata";
    } else if (type.startsWith("audio/")) {
        preview = document.createElement("audio");
        preview.controls = true;
        preview.preload = "metadata";
    }
    if (!preview) return;
    preview.src = attachment.url;
    preview.className = "message-attachment";
    message.appendChild(preview);
}

function loadMessages() {
    const messagesQuery = query(collection(db, "messages"), orderBy("timestamp", "asc"), limit(100));
    onSnapshot(messagesQuery, (snapshot) => {
        if (!messagesElement) return;
        messagesElement.replaceChildren();
        snapshot.forEach((messageSnapshot) => {
            const data = messageSnapshot.data();
            const message = document.createElement("div");
            message.className = "message";
            const author = document.createElement("strong");
            author.textContent = `${data.username || "Member"}: `;
            message.append(author, document.createTextNode(data.text || ""));
            appendAttachment(message, data.attachment);
            messagesElement.appendChild(message);
        });
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }, (error) => {
        console.error("Firestore error:", error);
        if (messagesElement) messagesElement.textContent = "Unable to load messages. Please check your connection.";
    });
}

async function sendMessage() {
    if (!currentUid || !input) return;
    const text = input.value.trim();
    if (!text) return;
    if (text.length > 2000) {
        alert("Messages cannot exceed 2000 characters.");
        return;
    }
    try {
        await addDoc(collection(db, "messages"), {
            uid: currentUid,
            username: currentUser.slice(0, 30),
            text,
            timestamp: serverTimestamp()
        });
        input.value = "";
        input.focus();
    } catch (error) {
        console.error("Message error:", error);
        alert("Message could not be sent. Please try again.");
    }
}

window.sendMessage = sendMessage;
window.clearChat = function () {
    alert("Shared lounge messages are visible to everyone and cannot be cleared here.");
};
window.logout = async function () {
    try {
        if (window.leaveVoiceChat) await window.leaveVoiceChat();
        const { signOut } = await import("https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js");
        await signOut(auth);
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout error:", error);
        alert("Unable to log out.");
    }
};

messageForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
});

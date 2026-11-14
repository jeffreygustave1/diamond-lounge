import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
    addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const messagesElement = document.getElementById("messages");
const input = document.getElementById("messageInput");
const messageForm = document.getElementById("messageForm");
let currentUser = null;
let chatLoaded = false;

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("login.html");
        return;
    }

    currentUser = user;
    const displayName = user.displayName || user.email || "Member";
    const profileName = document.getElementById("profileName");
    const currentUserElement = document.getElementById("currentUser");
    if (profileName) profileName.textContent = displayName;
    const currentName = currentUserElement?.querySelector("span");
    if (currentName) currentName.textContent = displayName;

    if (!chatLoaded) {
        chatLoaded = true;
        loadMessages();
    }
});

function renderAttachment(message, attachment) {
    if (!attachment || typeof attachment.url !== "string" || !attachment.url.startsWith("https://firebasestorage.googleapis.com/")) return;
    const type = typeof attachment.type === "string" ? attachment.type : "";
    let element;
    if (type.startsWith("image/")) {
        element = document.createElement("img");
        element.alt = attachment.name || "Shared image";
        element.loading = "lazy";
    } else if (type.startsWith("video/")) {
        element = document.createElement("video");
        element.controls = true;
        element.preload = "metadata";
    } else if (type.startsWith("audio/")) {
        element = document.createElement("audio");
        element.controls = true;
        element.preload = "metadata";
    }
    if (!element) return;
    element.src = attachment.url;
    element.className = "message-attachment";
    message.appendChild(element);
}

function loadMessages() {
    const messagesQuery = query(collection(db, "messages"), orderBy("timestamp", "asc"), limit(100));
    onSnapshot(messagesQuery, (snapshot) => {
        if (!messagesElement) return;
        messagesElement.replaceChildren();
        snapshot.forEach((entry) => {
            const data = entry.data();
            const message = document.createElement("article");
            message.className = "message";
            const author = document.createElement("strong");
            author.textContent = `${data.username || "Member"}: `;
            message.append(author, document.createTextNode(data.text || ""));
            renderAttachment(message, data.attachment);
            messagesElement.appendChild(message);
        });
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }, (error) => {
        console.error("Chat listener failed:", error);
        if (messagesElement) messagesElement.textContent = "Messages could not load. Check Firestore rules and connection.";
    });
}

async function sendMessage() {
    if (!currentUser || !input) return;
    const text = input.value.trim();
    if (!text) return;
    if (text.length > 2000) {
        alert("Messages cannot exceed 2000 characters.");
        return;
    }
    try {
        await addDoc(collection(db, "messages"), {
            uid: currentUser.uid,
            username: (currentUser.displayName || currentUser.email || "Member").slice(0, 30),
            text,
            timestamp: serverTimestamp()
        });
        input.value = "";
        input.focus();
    } catch (error) {
        console.error("Message send failed:", error);
        alert(error.code === "permission-denied"
            ? "Firestore denied this message. Publish the provided firestore.rules."
            : "Message could not be sent. Check your connection and try again.");
    }
}

window.sendMessage = sendMessage;
window.clearChat = () => alert("Shared lounge messages are visible to everyone and cannot be cleared here.");
window.logout = async () => {
    try {
        if (window.leaveVoiceChat) await window.leaveVoiceChat();
        await signOut(auth);
        window.location.replace("login.html");
    } catch (error) {
        console.error("Logout failed:", error);
        alert("Unable to log out. Please try again.");
    }
};

messageForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
});

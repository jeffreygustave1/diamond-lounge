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

let selectedVoiceChannel = null;
let localVoiceStream = null;
let voiceMuted = false;
const voiceStatus = document.getElementById("voiceStatus");
const voiceToggleBtn = document.getElementById("voiceToggleBtn");
const muteToggleBtn = document.getElementById("muteToggleBtn");

function updateVoiceStatus(message) {
    if (voiceStatus) {
        voiceStatus.textContent = message;
    }
}

function stopVoiceStream() {
    if (!localVoiceStream) return;

    localVoiceStream.getTracks().forEach((track) => track.stop());
    localVoiceStream = null;
    voiceMuted = false;

    if (muteToggleBtn) {
        muteToggleBtn.textContent = "Mute";
    }

    if (voiceToggleBtn) {
        voiceToggleBtn.textContent = selectedVoiceChannel ? "Join Voice" : "Join Voice";
    }
}

async function toggleVoiceChat() {
    if (!selectedVoiceChannel) {
        alert("Select a voice channel first.");
        return;
    }

    if (localVoiceStream) {
        stopVoiceStream();
        updateVoiceStatus(`Voice channel: ${selectedVoiceChannel} • disconnected`);
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser does not support microphone access.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        localVoiceStream = stream;

        const audioElement = new Audio();
        audioElement.srcObject = stream;
        audioElement.autoplay = true;
        audioElement.muted = false;

        document.body.appendChild(audioElement);

        if (voiceToggleBtn) {
            voiceToggleBtn.textContent = "Leave Voice";
        }

        if (muteToggleBtn) {
            muteToggleBtn.disabled = false;
        }

        updateVoiceStatus(`Voice channel: ${selectedVoiceChannel} • live`);
    } catch (error) {
        console.error("Microphone access error:", error);
        alert("Microphone access was blocked. Please allow microphone permission and try again.");
    }
}

function toggleMute() {
    if (!localVoiceStream) {
        return;
    }

    voiceMuted = !voiceMuted;
    localVoiceStream.getAudioTracks().forEach((track) => {
        track.enabled = !voiceMuted;
    });

    if (muteToggleBtn) {
        muteToggleBtn.textContent = voiceMuted ? "Unmute" : "Mute";
    }

    updateVoiceStatus(
        `Voice channel: ${selectedVoiceChannel} • ${voiceMuted ? "muted" : "live"}`
    );
}

function setSelectedVoiceChannel(channelElement) {
    document.querySelectorAll(".voice-channel").forEach((item) => {
        item.classList.toggle("active", item === channelElement);
    });

    selectedVoiceChannel = channelElement ? channelElement.dataset.voiceName : null;

    if (localVoiceStream && selectedVoiceChannel) {
        updateVoiceStatus(`Voice channel: ${selectedVoiceChannel} • live`);
    } else if (selectedVoiceChannel) {
        updateVoiceStatus(`Voice channel: ${selectedVoiceChannel} • ready`);
    } else {
        updateVoiceStatus("Voice channel: none");
    }

    if (voiceToggleBtn) {
        voiceToggleBtn.textContent = localVoiceStream ? "Leave Voice" : "Join Voice";
    }
}

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

function loadMessages() {
    const messagesRef = collection(db, "messages");
    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "asc"),
        limit(100)
    );

    onSnapshot(messagesQuery, (snapshot) => {
        if (!messagesElement) return;

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

        if (messagesElement) {
            messagesElement.textContent = "Unable to load messages. Please check your connection.";
        }
    });
}

window.sendMessage = async function () {
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

window.clearChat = function () {
    alert("Cloud messages are shared with everyone and cannot be cleared from this button.");
};

window.logout = async function () {
    try {
        stopVoiceStream();
        await signOut(auth);
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout error:", error);
        alert("Unable to log out.");
    }
};

if (input) {
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            window.sendMessage();
        }
    });
}

document.querySelectorAll(".voice-channel").forEach((channel) => {
    channel.addEventListener("click", () => {
        setSelectedVoiceChannel(channel);
    });
});

if (voiceToggleBtn) {
    voiceToggleBtn.addEventListener("click", toggleVoiceChat);
}

if (muteToggleBtn) {
    muteToggleBtn.disabled = true;
    muteToggleBtn.addEventListener("click", toggleMute);
}

console.log("Diamond Lounge Real-Time Chat Ready 💎");

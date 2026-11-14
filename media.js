import { auth, db, storage } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
    addDoc,
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import {
    getDownloadURL,
    ref,
    uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-storage.js";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const mediaInput = document.getElementById("mediaInput");
const uploadStatus = document.getElementById("uploadStatus");
const mediaGallery = document.getElementById("sharedMedia");
let signedInUser = null;

onAuthStateChanged(auth, (user) => {
    signedInUser = user;
    if (!user) return;

    const mediaQuery = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(50));
    onSnapshot(mediaQuery, (snapshot) => {
        if (!mediaGallery) return;
        mediaGallery.replaceChildren();
        let count = 0;

        snapshot.forEach((messageSnapshot) => {
            const data = messageSnapshot.data();
            if (!data.attachment?.url || !/^https:\/\//i.test(data.attachment.url)) return;
            count += 1;

            const card = document.createElement("article");
            card.className = "shared-media-card";
            const name = document.createElement("div");
            name.className = "shared-media-name";
            name.textContent = `${data.username || "Member"} · ${data.attachment.name || "Shared media"}`;
            card.appendChild(name);

            const url = data.attachment.url;
            const type = data.attachment.type || "";
            let preview;
            if (type.startsWith("image/")) {
                preview = document.createElement("img");
                preview.src = url;
                preview.alt = data.attachment.name || "Shared image";
                preview.loading = "lazy";
            } else if (type.startsWith("video/")) {
                preview = document.createElement("video");
                preview.src = url;
                preview.controls = true;
                preview.preload = "metadata";
            } else if (type.startsWith("audio/")) {
                preview = document.createElement("audio");
                preview.src = url;
                preview.controls = true;
                preview.preload = "metadata";
            } else {
                preview = document.createElement("a");
                preview.href = url;
                preview.textContent = "Open shared file";
                preview.target = "_blank";
                preview.rel = "noopener noreferrer";
            }
            preview.classList.add("shared-media-preview");
            card.appendChild(preview);
            mediaGallery.appendChild(card);
        });

        if (!count) {
            const empty = document.createElement("p");
            empty.className = "media-empty";
            empty.textContent = "Nothing shared here yet.";
            mediaGallery.appendChild(empty);
        }
    }, (error) => {
        console.error("Shared media listener failed:", error);
        if (mediaGallery) mediaGallery.textContent = "Shared media could not be loaded.";
    });
});

mediaInput?.addEventListener("change", async () => {
    const file = mediaInput.files?.[0];
    if (!file) return;

    if (!signedInUser) {
        showStatus("Please sign in before sharing a file.", true);
        mediaInput.value = "";
        return;
    }
    if (!(file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/"))) {
        showStatus("Choose an image, GIF, video, or audio file.", true);
        mediaInput.value = "";
        return;
    }
    if (file.size > MAX_FILE_SIZE) {
        showStatus("Files must be 25 MB or smaller.", true);
        mediaInput.value = "";
        return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
    const objectRef = ref(storage, `uploads/${signedInUser.uid}/${Date.now()}_${safeName}`);
    showStatus(`Uploading ${file.name}…`);

    try {
        const task = uploadBytesResumable(objectRef, file, { contentType: file.type });
        await new Promise((resolve, reject) => {
            task.on("state_changed", (snapshot) => {
                const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                showStatus(`Uploading ${file.name} · ${percent}%`);
            }, reject, resolve);
        });
        const url = await getDownloadURL(task.snapshot.ref);
        const name = signedInUser.displayName || signedInUser.email || "Member";
        const messageText = inputText();
        await addDoc(collection(db, "messages"), {
            uid: signedInUser.uid,
            username: name.slice(0, 30),
            text: messageText || `Shared ${file.type.startsWith("image/") ? "an image" : file.type.startsWith("video/") ? "a video" : "audio"}`,
            attachment: { name: file.name.slice(0, 120), type: file.type, url, size: file.size },
            timestamp: serverTimestamp()
        });
        if (messageInput()) messageInput().value = "";
        showStatus("Shared with the lounge.");
    } catch (error) {
        console.error("Media upload failed:", error);
        showStatus(error.code === "storage/unauthorized"
            ? "Upload blocked. Publish the Storage rules from storage.rules."
            : "Upload failed. Check Firebase Storage is enabled and try again.", true);
    } finally {
        mediaInput.value = "";
    }
});

function showStatus(message, isError = false) {
    if (!uploadStatus) return;
    uploadStatus.textContent = message;
    uploadStatus.classList.toggle("error", isError);
}

function inputText() {
    return messageInput()?.value.trim() || "";
}

function messageInput() {
    return document.getElementById("messageInput");
}

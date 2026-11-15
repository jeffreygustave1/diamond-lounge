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
let activeUpload = null;

onAuthStateChanged(auth, (user) => {
    signedInUser = user;
    if (!user || !mediaGallery) return;

    const mediaQuery = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(50));
    onSnapshot(mediaQuery, (snapshot) => {
        mediaGallery.replaceChildren();
        let count = 0;

        snapshot.forEach((messageSnapshot) => {
            const data = messageSnapshot.data();
            const attachment = data.attachment;
            if (!attachment?.url || !/^https:\/\/firebasestorage\.googleapis\.com\//i.test(attachment.url)) return;

            const type = typeof attachment.type === "string" ? attachment.type : "";
            let preview;
            if (type.startsWith("image/")) {
                preview = document.createElement("img");
                preview.src = attachment.url;
                preview.alt = attachment.name || "Shared image";
                preview.loading = "lazy";
            } else if (type.startsWith("video/")) {
                preview = document.createElement("video");
                preview.src = attachment.url;
                preview.controls = true;
                preview.preload = "metadata";
            } else if (type.startsWith("audio/")) {
                preview = document.createElement("audio");
                preview.src = attachment.url;
                preview.controls = true;
                preview.preload = "metadata";
            }
            if (!preview) return;

            count += 1;
            const card = document.createElement("article");
            card.className = "shared-media-card";
            const label = document.createElement("div");
            label.className = "shared-media-name";
            label.textContent = `${data.username || "Member"} · ${attachment.name || "Shared media"}`;
            preview.classList.add("shared-media-preview");
            card.append(label, preview);
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
        mediaGallery.textContent = "Shared media could not be loaded. Check Firestore access.";
    });
});

mediaInput?.addEventListener("change", async () => {
    const file = mediaInput.files?.[0];
    if (!file) return;

    if (!signedInUser) {
        setStatus("Please sign in before sharing a file.", true);
        mediaInput.value = "";
        return;
    }
    if (!/^(image|video|audio)\//i.test(file.type)) {
        setStatus("Choose an image, GIF, video, or audio file.", true);
        mediaInput.value = "";
        return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        setStatus("Files must be larger than 0 and no bigger than 25 MB.", true);
        mediaInput.value = "";
        return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
    const objectRef = ref(storage, `uploads/${signedInUser.uid}/${Date.now()}_${safeName}`);
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendMessageButton");
    const uploadLabel = document.querySelector('label[for="mediaInput"]');
    let lastProgressAt = Date.now();
    let diagnosticTimer;
    let unsubscribe = () => {};

    mediaInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    if (uploadLabel) uploadLabel.setAttribute("aria-disabled", "true");
    setStatus(`Connecting to Firebase Storage for ${file.name}…`);

    try {
        activeUpload = uploadBytesResumable(objectRef, file, { contentType: file.type });
        await new Promise((resolve, reject) => {
            unsubscribe = activeUpload.on("state_changed", (snapshot) => {
                lastProgressAt = Date.now();
                const percent = snapshot.totalBytes
                    ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
                    : 0;
                setStatus(`Uploading ${file.name} · ${percent}% (${formatBytes(snapshot.bytesTransferred)} of ${formatBytes(snapshot.totalBytes)})`);
            }, reject, resolve);

            diagnosticTimer = window.setInterval(() => {
                if (Date.now() - lastProgressAt > 15000) {
                    setStatus("Upload is stalled. Check that Firebase Storage is enabled, its bucket matches firebase.js, and Storage rules are published.", true);
                    lastProgressAt = Date.now();
                }
            }, 5000);
        });

        const downloadUrl = await getDownloadURL(activeUpload.snapshot.ref);
        const username = (signedInUser.displayName || signedInUser.email || "Member").slice(0, 30);
        const caption = messageInput?.value.trim();
        const mediaDescription = file.type.startsWith("image/") ? "an image" : file.type.startsWith("video/") ? "a video" : "audio";

        await addDoc(collection(db, "messages"), {
    uid: signedInUser.uid,
    username,
    channelId,
    text: (caption || `Shared ${mediaDescription}`).slice(0, 2000),
    attachment: {
        name: file.name.slice(0, 120),
        type: file.type,
        url: downloadUrl,
        size: file.size
    },
    timestamp: serverTimestamp()
});


        if (messageInput) messageInput.value = "";
        setStatus("Shared with the lounge.");
    } catch (error) {
        console.error("Media upload failed:", error);
        setStatus(uploadErrorMessage(error), true);
    } finally {
        if (diagnosticTimer) window.clearInterval(diagnosticTimer);
        unsubscribe();
        activeUpload = null;
        mediaInput.disabled = false;
        mediaInput.value = "";
        if (sendButton) sendButton.disabled = false;
        if (uploadLabel) uploadLabel.removeAttribute("aria-disabled");
    }
});

function uploadErrorMessage(error) {
    switch (error?.code) {
        case "storage/unauthorized":
            return "Upload permission denied. Publish storage.rules in Firebase Storage and sign in again.";
        case "storage/bucket-not-found":
        case "storage/project-not-found":
            return "Firebase Storage bucket not found. Enable Storage and verify storageBucket in firebase.js.";
        case "storage/quota-exceeded":
            return "Firebase Storage quota exceeded. Check your Firebase plan and usage.";
        case "storage/retry-limit-exceeded":
        case "storage/canceled":
            return "Upload stopped because the connection failed or was canceled. Try again on a stable connection.";
        case "storage/unknown":
            return "Firebase Storage could not complete the upload. Check Storage setup, rules, and browser console.";
        case "permission-denied":
            return "The file uploaded but Firestore rejected its message. Publish the messages rules from firestore.rules.";
        default:
            return `Upload failed${error?.code ? ` (${error.code})` : ""}. Verify Firebase Storage is enabled and try again.`;
    }
}

function setStatus(message, isError = false) {
    if (!uploadStatus) return;
    uploadStatus.textContent = message;
    uploadStatus.classList.toggle("error", isError);
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

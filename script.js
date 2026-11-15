import { auth, db } from "./firebase.js";

import {     onAuthStateChanged,     signOut } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {     addDoc,     collection,     doc,     getDoc,     limit,     onSnapshot,     orderBy,     query,     serverTimestamp,     setDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

// ========================================== // PUBLIC CHAT ELEMENTS // ==========================================

const messagesElement = document.getElementById("messages"); const input = document.getElementById("messageInput"); const messageForm = document.getElementById("messageForm"); const sendButton = document.getElementById("sendMessageButton");

// ========================================== // MOBILE NAVIGATION ELEMENTS // ==========================================

const dashboard = document.querySelector(".dashboard"); const mobileSidebarBackdrop = document.getElementById("mobileSidebarBackdrop"); const mobileMenuButtons = document.querySelectorAll(".mobile-menu-button");

// ========================================== // DIRECT MESSAGE ELEMENTS // ==========================================

const dmHomeButton = document.getElementById("dmHomeButton");

const loungeSidebar = document.getElementById("loungeSidebar"); const dmSidebar = document.getElementById("dmSidebar");

const loungeView = document.getElementById("loungeView"); const dmHomeView = document.getElementById("dmHomeView"); const dmConversationView = document.getElementById("dmConversationView");

const communitySidebar = document.getElementById("communitySidebar");

const memberSearch = document.getElementById("memberSearch"); const dmMemberList = document.getElementById("dmMemberList");

const dmContactName = document.getElementById("dmContactName"); const dmMessages = document.getElementById("dmMessages"); const dmMessageForm = document.getElementById("dmMessageForm"); const dmMessageInput = document.getElementById("dmMessageInput"); const dmSendButton = document.getElementById("dmSendButton"); const dmStatus = document.getElementById("dmStatus");

// ========================================== // APPLICATION STATE // ==========================================

let currentUser = null; let chatLoaded = false;

let stopMessagesListener = null; let stopMembersListener = null; let stopDirectMessagesListener = null;

let members = []; let selectedMember = null; let currentConversationId = null;

// ========================================== // MOBILE DRAWER CONTROLS // ==========================================

function setMobileSidebar(open) {     if (!dashboard) return;
dashboard.classList.toggle("mobile-nav-open", open);

mobileMenuButtons.forEach((button) => {
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute(
        "aria-label",
        open ? "Close navigation menu" : "Open navigation menu"
    );
});

}

function toggleMobileSidebar() {     if (!dashboard) return;
const isOpen = dashboard.classList.contains("mobile-nav-open");

setMobileSidebar(!isOpen);

}

// Hamburger buttons mobileMenuButtons.forEach((button) => {     button.addEventListener("click", toggleMobileSidebar); });

// Backdrop closes the drawer mobileSidebarBackdrop?.addEventListener("click", () => {     setMobileSidebar(false); });

// Escape closes the drawer document.addEventListener("keydown", (event) => {     if (event.key === "Escape") {         setMobileSidebar(false);     } });

// Selecting a text channel closes the mobile drawer document.getElementById("channelsSidebar")?.addEventListener("click", (event) => {     const channel = event.target.closest(".text-channel");
if (channel) {
    setMobileSidebar(false);
}

});

// ========================================== // AUTHENTICATION // ==========================================

onAuthStateChanged(auth, async (user) => {     if (!user) {         window.location.replace("login.html");         return;     }
currentUser = user;

// Never use the email address as a public display name.
const displayName = (user.displayName || "Member").slice(0, 30);

const profileName = document.getElementById("profileName");
const currentUserElement = document.getElementById("currentUser");

if (profileName) {
    profileName.textContent = displayName;
}

const currentName = currentUserElement?.querySelector("span");

if (currentName) {
    currentName.textContent = displayName;
}

if (!chatLoaded) {
    chatLoaded = true;
    loadMessages();
}

// Create a profile for existing accounts if one is missing.
try {
    await ensureUserProfile();
    loadMembers();
} catch (error) {
    console.error("Member profile setup failed:", error);

    if (dmMemberList) {
        dmMemberList.textContent =
            "Member profiles could not load. Please refresh and try again.";
    }
}

});

// ========================================== // MEMBER PROFILE SETUP // ==========================================

async function ensureUserProfile() {     if (!currentUser) return;
const userRef = doc(db, "users", currentUser.uid);
const userSnapshot = await getDoc(userRef);

if (!userSnapshot.exists()) {
    await setDoc(userRef, {
        uid: currentUser.uid,
        displayName: (currentUser.displayName || "Member").slice(0, 30),
        createdAt: serverTimestamp()
    });
}

}

// ========================================== // PUBLIC CHAT ATTACHMENTS // ==========================================

function renderAttachment(message, attachment) {     if (         !attachment ||         typeof attachment.url !== "string" ||         !/^https:\/\/firebasestorage.googleapis.com\//i.test(attachment.url)     ) {         return;     }
const type = typeof attachment.type === "string"
    ? attachment.type
    : "";

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

// ========================================== // LOAD PUBLIC CHAT // ==========================================

function loadMessages() {     if (!messagesElement) return;
const messagesQuery = query(
    collection(db, "messages"),
    orderBy("timestamp", "asc"),
    limit(100)
);

stopMessagesListener = onSnapshot(
    messagesQuery,
    (snapshot) => {
        messagesElement.replaceChildren();

        snapshot.forEach((entry) => {
            const data = entry.data();

            const message = document.createElement("article");
            message.className = "message";

            const author = document.createElement("strong");
            author.textContent = `${data.username || "Member"}: `;

            message.append(
                author,
                document.createTextNode(data.text || "")
            );

            renderAttachment(message, data.attachment);

            messagesElement.appendChild(message);
        });

        messagesElement.scrollTop = messagesElement.scrollHeight;
    },
    (error) => {
        console.error("Chat listener failed:", error);

        messagesElement.textContent =
            error.code === "permission-denied"
                ? "Firestore denied chat access. Check your published messages rules."
                : "Messages could not load. Check your connection and Firebase setup.";
    }
);

}

// ========================================== // SEND PUBLIC MESSAGE // ==========================================

async function sendMessage() {     if (!currentUser || !input || !sendButton) return;
const text = input.value.trim();

if (!text) return;

if (text.length > 2000) {
    alert("Messages cannot exceed 2000 characters.");
    return;
}

sendButton.disabled = true;

try {
    await addDoc(collection(db, "messages"), {
        uid: currentUser.uid,
        username: (currentUser.displayName || "Member").slice(0, 30),
        text,
        timestamp: serverTimestamp()
    });

    input.value = "";
    input.focus();

} catch (error) {
    console.error("Message send failed:", error);

    alert(
        error.code === "permission-denied"
            ? "Firestore denied this message. Check your published messages rules."
            : `Message could not be sent${error.code ? ` (${error.code})` : ". Check your connection."}`
    );

} finally {
    sendButton.disabled = false;
}

}

// ========================================== // DIRECT MESSAGE NAVIGATION // ==========================================

function showDirectMessages() {     if (!currentUser) return;
stopDirectMessages();

selectedMember = null;
currentConversationId = null;

if (loungeSidebar) loungeSidebar.hidden = true;
if (dmSidebar) dmSidebar.hidden = false;

if (loungeView) loungeView.hidden = true;
if (dmHomeView) dmHomeView.hidden = false;
if (dmConversationView) dmConversationView.hidden = true;

if (communitySidebar) communitySidebar.hidden = true;

if (dmHomeButton) {
    dmHomeButton.classList.add("selected");
    dmHomeButton.setAttribute("aria-pressed", "true");
}

document.body.classList.add("dm-mode");

if (dmStatus) {
    dmStatus.textContent = "";
    dmStatus.classList.remove("error");
}

if (memberSearch) {
    memberSearch.value = "";
    renderMembers();
}

}

function showLounge() {     stopDirectMessages();
selectedMember = null;
currentConversationId = null;

if (dmSidebar) dmSidebar.hidden = true;
if (loungeSidebar) loungeSidebar.hidden = false;

if (dmHomeView) dmHomeView.hidden = true;
if (dmConversationView) dmConversationView.hidden = true;
if (loungeView) loungeView.hidden = false;

if (communitySidebar) communitySidebar.hidden = false;

if (dmHomeButton) {
    dmHomeButton.classList.remove("selected");
    dmHomeButton.setAttribute("aria-pressed", "false");
}

document.body.classList.remove("dm-mode");

}

function showConversationView() {     if (dmHomeView) dmHomeView.hidden = true;     if (dmConversationView) dmConversationView.hidden = false;     if (loungeView) loungeView.hidden = true;
if (dmSidebar) dmSidebar.hidden = false;
if (loungeSidebar) loungeSidebar.hidden = true;
if (communitySidebar) communitySidebar.hidden = true;

document.body.classList.add("dm-mode");

// Selecting a member returns to the conversation.
setMobileSidebar(false);

}

// ========================================== // LOAD MEMBER DIRECTORY // ==========================================

function loadMembers() {     if (!dmMemberList) return;
if (stopMembersListener) {
    stopMembersListener();
    stopMembersListener = null;
}

const membersQuery = query(
    collection(db, "users"),
    orderBy("displayName", "asc")
);

stopMembersListener = onSnapshot(
    membersQuery,
    (snapshot) => {
        members = [];

        snapshot.forEach((entry) => {
            const data = entry.data();

            if (
                data.uid &&
                data.uid !== currentUser?.uid &&
                typeof data.displayName === "string"
            ) {
                members.push({
                    uid: data.uid,
                    displayName: data.displayName
                });
            }
        });

        renderMembers();
    },
    (error) => {
        console.error("Member directory failed:", error);

        dmMemberList.textContent =
            error.code === "permission-denied"
                ? "Firestore denied access to member profiles. Check the users rules."
                : "Members could not load. Please try again.";
    }
);

}

// ========================================== // DISPLAY MEMBER DIRECTORY // ==========================================

function renderMembers() {     if (!dmMemberList) return;
dmMemberList.replaceChildren();

const searchText = (memberSearch?.value || "")
    .trim()
    .toLowerCase();

const filteredMembers = members.filter((member) =>
    member.displayName.toLowerCase().includes(searchText)
);

if (filteredMembers.length === 0) {
    const empty = document.createElement("li");
    empty.className = "dm-empty";

    empty.textContent = searchText
        ? "No members match your search."
        : "No other members have joined yet.";

    dmMemberList.appendChild(empty);
    return;
}

filteredMembers.forEach((member) => {
    const item = document.createElement("li");
    item.className = "dm-member-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-member-button";

    if (selectedMember?.uid === member.uid) {
        button.classList.add("active");
    }

    const avatar = document.createElement("span");
    avatar.className = "dm-member-avatar";
    avatar.textContent = member.displayName.charAt(0).toUpperCase();

    const copy = document.createElement("span");
    copy.className = "dm-member-copy";

    const name = document.createElement("strong");
    name.textContent = member.displayName;

    const status = document.createElement("small");
    status.textContent = "Diamond Lounge member";

    copy.append(name, status);
    button.append(avatar, copy);

    button.addEventListener("click", () => {
        void openConversation(member);
    });

    item.appendChild(button);
    dmMemberList.appendChild(item);
});

}

// ========================================== // CREATE / OPEN PRIVATE CONVERSATION // ==========================================

function getConversationId(firstUid, secondUid) {     return [firstUid, secondUid]         .sort()         .join("_"); }

async function openConversation(member) {     if (!currentUser || !member || !member.uid) return;
stopDirectMessages();

selectedMember = member;
currentConversationId = getConversationId(
    currentUser.uid,
    member.uid
);

const openingConversationId = currentConversationId;

showConversationView();

if (dmContactName) {
    dmContactName.textContent = member.displayName;
}

if (dmMessages) {
    dmMessages.replaceChildren();

    const loading = document.createElement("p");
    loading.className = "dm-empty";
    loading.textContent = "Opening private conversation...";

    dmMessages.appendChild(loading);
}

if (dmStatus) {
    dmStatus.textContent = "";
    dmStatus.classList.remove("error");
}

renderMembers();

try {
    const conversationRef = doc(
        db,
        "conversations",
        openingConversationId
    );

    const conversationSnapshot = await getDoc(conversationRef);

    if (!conversationSnapshot.exists()) {
        await setDoc(conversationRef, {
            participantUids: [
                currentUser.uid,
                member.uid
            ],
            createdAt: serverTimestamp()
        });
    }

    // Don't open a conversation if the user has navigated away
    // or selected a different member while it was loading.
    if (
        currentConversationId !== openingConversationId ||
        selectedMember?.uid !== member.uid
    ) {
        return;
    }

    loadDirectMessages();

} catch (error) {
    console.error("Private conversation failed:", error);

    if (currentConversationId !== openingConversationId) return;

    if (dmMessages) {
        dmMessages.textContent =
            error.code === "permission-denied"
                ? "Access denied. Check your published conversation rules."
                : "This private conversation could not be opened.";
    }
}

}

// ========================================== // STOP PRIVATE MESSAGE LISTENER // ==========================================

function stopDirectMessages() {     if (stopDirectMessagesListener) {         stopDirectMessagesListener();         stopDirectMessagesListener = null;     } }

// ========================================== // LOAD PRIVATE MESSAGES // ==========================================

function loadDirectMessages() {     if (!currentConversationId || !dmMessages) return;
stopDirectMessages();

const privateMessagesQuery = query(
    collection(
        db,
        "conversations",
        currentConversationId,
        "messages"
    ),
    orderBy("timestamp", "asc"),
    limit(100)
);

stopDirectMessagesListener = onSnapshot(
    privateMessagesQuery,
    (snapshot) => {
        dmMessages.replaceChildren();

        if (snapshot.empty) {
            const empty = document.createElement("p");
            empty.className = "dm-empty";
            empty.textContent = "This is the beginning of your conversation.";

            dmMessages.appendChild(empty);
            return;
        }

        snapshot.forEach((entry) => {
            const data = entry.data();

            const message = document.createElement("article");
            message.className = "message dm-message";

            if (data.uid === currentUser?.uid) {
                message.classList.add("own-message");
            }

            const author = document.createElement("strong");
            author.textContent = `${data.username || "Member"}: `;

            message.append(
                author,
                document.createTextNode(data.text || "")
            );

            dmMessages.appendChild(message);
        });

        dmMessages.scrollTop = dmMessages.scrollHeight;
    },
    (error) => {
        console.error("Private message listener failed:", error);

        dmMessages.textContent =
            error.code === "permission-denied"
                ? "You don't have permission to read this conversation."
                : "Private messages could not load.";
    }
);

}

// ========================================== // SEND PRIVATE MESSAGE // ==========================================

async function sendDirectMessage() {     if (         !currentUser ||         !currentConversationId ||         !selectedMember ||         !dmMessageInput ||         !dmSendButton     ) {         return;     }
const text = dmMessageInput.value.trim();

if (!text) return;

if (text.length > 2000) {
    alert("Messages cannot exceed 2000 characters.");
    return;
}

dmSendButton.disabled = true;

try {
    await addDoc(
        collection(
            db,
            "conversations",
            currentConversationId,
            "messages"
        ),
        {
            uid: currentUser.uid,
            username: (currentUser.displayName || "Member").slice(0, 30),
            text,
            timestamp: serverTimestamp()
        }
    );

    dmMessageInput.value = "";
    dmMessageInput.focus();

} catch (error) {
    console.error("Private message send failed:", error);

    if (dmStatus) {
        dmStatus.textContent =
            error.code === "permission-denied"
                ? "Firebase denied this private message. Check the conversation rules."
                : "Your message could not be sent. Please try again.";

        dmStatus.classList.add("error");
    }

} finally {
    dmSendButton.disabled = false;
}

}

// ========================================== // BUTTONS AND EVENTS // ==========================================

// The large diamond toggles between the Lounge and DMs. // It also works while a private conversation is open. dmHomeButton?.addEventListener("click", () => {     if (dmSidebar && !dmSidebar.hidden) {         showLounge();     } else {         showDirectMessages();     } });

memberSearch?.addEventListener("input", renderMembers);

messageForm?.addEventListener("submit", (event) => {     event.preventDefault();     void sendMessage(); });

dmMessageForm?.addEventListener("submit", (event) => {     event.preventDefault();     void sendDirectMessage(); });

// ========================================== // EXISTING PUBLIC FUNCTIONS // ==========================================

window.sendMessage = sendMessage;

window.clearChat = () => {     alert("Shared lounge messages are visible to everyone and cannot be cleared here."); };

// ========================================== // LOGOUT — BOTTOM PROFILE DIAMOND // ==========================================

window.logout = async () => {     try {         setMobileSidebar(false);
    stopDirectMessages();
    stopMembersListener?.();
    stopMessagesListener?.();

    if (window.leaveVoiceChat) {
        await window.leaveVoiceChat();
    }

    await signOut(auth);

    window.location.replace("login.html");

} catch (error) {
    console.error("Logout failed:", error);
    alert("Unable to log out. Please try again.");
}

};

// ========================================== // CLEANUP // ==========================================

window.addEventListener("pagehide", () => {     stopMessagesListener?.();     stopMembersListener?.();     stopDirectMessages(); });


voice.jsimport { auth, db } from "./firebase.js"; import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js"; import {     addDoc, collection, deleteDoc, doc, onSnapshot, query,     setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const HEARTBEATMS = 10000; const STALEAFTERMS = 35000; const ICESERVERS = [{ urls: "stun:stun.l.google.com:19302" }]; const panel = document.getElementById("voicePanel"); const channelItems = […document.querySelectorAll(".voice-channel")]; const joinButton = document.getElementById("voiceToggleBtn"); const muteButton = document.getElementById("muteToggleBtn"); const statusElement = document.getElementById("voiceStatus"); const participantsElement = document.getElementById("voiceParticipants"); const countElement = document.getElementById("voiceParticipantCount"); const audioContainer = document.getElementById("remoteAudioContainer");

let user = null; let selectedChannel = null; let roomId = null; let sessionId = null; let localStream = null; let heartbeatTimer = null; let stopParticipants = null; let stopCalls = null; let muted = false; const participants = new Map(); const peers = new Map(); const outgoingCalls = new Map(); const incomingCalls = new Map();

function setStatus(text) {     if (statusElement) statusElement.textContent = text; } function makeRoomId(name) {     return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); } function renderParticipants() {     if (!participantsElement) return;     const online = […participants.values()].filter((p) => Date.now() - p.heartbeatAt < STALEAFTERMS).sort((a, b) => a.name.localeCompare(b.name));     participantsElement.replaceChildren();     if (countElement) countElement.textContent = String(online.length);     if (!online.length) {         const empty = document.createElement("li");         empty.className = "voice-empty";         empty.textContent = "No one is here yet.";         participantsElement.appendChild(empty);         return;     }     online.forEach((person) => {         const item = document.createElement("li");         item.className = "voice-participant";         const dot = document.createElement("i");         dot.className = "voice-speaking-indicator";         const label = document.createElement("span");         label.textContent = ${person.name}${person.uid === user?.uid ? " (you)" : ""};         item.append(dot, label);         participantsElement.appendChild(item);     }); } function closePeer(uid) {     const peer = peers.get(uid);     if (!peer) return;     peer.unsubCall?.();     peer.unsubCandidates?.();     peer.pc.ontrack = null;     peer.pc.onicecandidate = null;     peer.pc.close();     peer.audio?.remove();     peers.delete(uid); } function closeAllPeers() { […peers.keys()].forEach(closePeer); } function makePeer(person, callRef) {     const pc = new RTCPeerConnection({ iceServers: ICESERVERS });     const peer = { pc, callRef, audio: null, unsubCall: null, unsubCandidates: null, candidateIds: new Set(), waitingCandidates: [] };     peers.set(person.uid, peer);     localStream?.getAudioTracks().forEach((track) => pc.addTrack(track, localStream));     pc.ontrack = (event) => {         if (!peer.audio) {             peer.audio = document.createElement("audio");             peer.audio.autoplay = true;             peer.audio.playsInline = true;             peer.audio.dataset.peer = person.uid;             audioContainer?.appendChild(peer.audio);         }         peer.audio.srcObject = event.streams[0];         peer.audio.play().catch(() => setStatus("Voice connected. Click once on the page if your browser blocks audio playback."));     };     pc.onicecandidate = async (event) => {         if (!event.candidate) return;         try {             await addDoc(collection(callRef, "candidates"), { uid: user.uid, candidate: event.candidate.toJSON() });         } catch (error) {             console.error("ICE candidate write failed:", error);             setStatus("Voice signaling denied. Publish the latest Firestore rules.");         }     };     pc.onconnectionstatechange = () => {         if (pc.connectionState === "failed") setStatus("Voice network connection failed. A TURN server may be needed on this network.");         if (["failed", "closed"].includes(pc.connectionState)) closePeer(person.uid);     };     peer.unsubCandidates = onSnapshot(collection(callRef, "candidates"), (snapshot) => {         snapshot.docChanges().forEach(async (change) => {             if (change.type !== "added" || peer.candidateIds.has(change.doc.id)) return;             peer.candidateIds.add(change.doc.id);             const data = change.doc.data();             if (data.uid === user.uid || !data.candidate) return;             const candidate = new RTCIceCandidate(data.candidate);             if (!pc.remoteDescription) { peer.waitingCandidates.push(candidate); return; }             try { await pc.addIceCandidate(candidate); }             catch (error) { console.warn("Could not add ICE candidate:", error); }         });     }, (error) => {         console.error("Candidate listener failed:", error);         setStatus("Voice signaling denied. Check Firestore call/candidate rules.");     });     return peer; } async function addWaitingCandidates(peer) {     for (const candidate of peer.waitingCandidates.splice(0)) {         try { await peer.pc.addIceCandidate(candidate); }         catch (error) { console.warn("Could not add queued ICE candidate:", error); }     } } async function startOutgoingCall(person) {     if (!localStream || peers.has(person.uid) || person.uid === user.uid || user.uid.localeCompare(person.uid) > 0) return;     const callRef = doc(collection(doc(db, "voiceRooms", roomId), "calls"));     const peer = makePeer(person, callRef);     outgoingCalls.set(person.uid, callRef);     try {         await setDoc(callRef, { callerUid:user.uid, callerSessionId:sessionId, calleeUid:person.uid, calleeSessionId:person.sessionId, offer:null, answer:null, createdAt:Date.now() });         const offer = await peer.pc.createOffer();         await peer.pc.setLocalDescription(offer);         await updateDoc(callRef, { offer:{type:offer.type,sdp:offer.sdp} });         peer.unsubCall = onSnapshot(callRef, async (snapshot) => {             if (!snapshot.exists()) { closePeer(person.uid); return; }             const answer = snapshot.data().answer;             if (answer && !peer.pc.remoteDescription) {                 try { await peer.pc.setRemoteDescription(new RTCSessionDescription(answer)); await addWaitingCandidates(peer); }                 catch (error) { console.error("Could not apply answer:", error); closePeer(person.uid); }             }         }, (error) => console.error("Call answer listener failed:", error));     } catch (error) {         console.error("Could not start voice call:", error);         closePeer(person.uid);         setStatus(error.code === "permission-denied" ? "Firestore denied voice signaling. Publish firestore.rules." : "Could not start voice. Check the browser console and Firestore rules.");     } } async function answerIncomingCall(callSnapshot) {     const data = callSnapshot.data();     const caller = participants.get(data.callerUid);     if (!localStream || !caller || caller.sessionId !== data.callerSessionId || data.calleeSessionId !== sessionId || !data.offer || peers.has(data.callerUid)) return;     const peer = makePeer(caller, callSnapshot.ref);     try {         await peer.pc.setRemoteDescription(new RTCSessionDescription(data.offer));         await addWaitingCandidates(peer);         const answer = await peer.pc.createAnswer();         await peer.pc.setLocalDescription(answer);         await updateDoc(callSnapshot.ref, { answer:{type:answer.type,sdp:answer.sdp} });     } catch (error) {         console.error("Could not answer voice call:", error);         closePeer(data.callerUid);         setStatus("Could not answer voice call. Check Firestore rules.");     } } function processIncomingCalls() { incomingCalls.forEach((snapshot) => void answerIncomingCall(snapshot)); } function watchParticipants() {     stopParticipants?.();     participants.clear();     renderParticipants();     stopParticipants = onSnapshot(collection(db, "voiceRooms", roomId, "participants"), (snapshot) => {         const fresh = new Map();         snapshot.forEach((entry) => {             const data = entry.data();             const heartbeatAt = Number(data.heartbeatAt || 0);             if (data.uid && data.name && Date.now() - heartbeatAt < STALEAFTERMS) fresh.set(data.uid, {uid:data.uid,name:data.name,sessionId:data.sessionId,heartbeatAt});         });         participants.clear();         fresh.forEach((value, key) => participants.set(key, value));         renderParticipants();         […peers.keys()].forEach((uid) => { if (!participants.has(uid)) closePeer(uid); });         if (localStream) {             participants.forEach((person) => { if (person.uid !== user.uid) void startOutgoingCall(person); });             processIncomingCalls();         }     }, (error) => {         console.error("Voice presence listener failed:", error);         setStatus("Could not read voice members. Publish Firestore voice rules.");     }); } function watchIncomingCalls() {     stopCalls?.();     stopCalls = onSnapshot(query(collection(db, "voiceRooms", roomId, "calls"), where("calleeUid", "==", user.uid)), (snapshot) => {         snapshot.docChanges().forEach((change) => {             if (change.type === "removed") {                 incomingCalls.delete(change.doc.id);                 const callerUid = change.doc.data()?.callerUid;                 if (callerUid) closePeer(callerUid);             } else incomingCalls.set(change.doc.id, change.doc);         });         processIncomingCalls();     }, (error) => {         console.error("Voice call listener failed:", error);         setStatus("Voice signaling denied. Republish Firestore voice rules.");     }); } async function joinOrLeave() {     if (!user) { setStatus("Sign in before joining a voice lounge."); return; }     if (!selectedChannel || !roomId) { setStatus("Click a voice lounge first."); return; }     if (localStream) { await leaveVoice(); return; }     if (!navigator.mediaDevices?.getUserMedia) { setStatus("Microphone requires HTTPS and a supported browser."); return; }     joinButton.disabled = true;     setStatus("Requesting microphone permission…");     try {         localStream = await navigator.mediaDevices.getUserMedia({ audio:true });         sessionId = globalThis.crypto?.randomUUID?.() || ${Date.now()}-${Math.random().toString(36).slice(2)};         muted = false;         muteButton.disabled = false;         muteButton.textContent = "Mute";         joinButton.textContent = "Leave Voice";         const presenceRef = doc(db, "voiceRooms", roomId, "participants", user.uid);         const heartbeat = () => setDoc(presenceRef, {uid:user.uid,name:(user.displayName || user.email || "Member").slice(0,80),sessionId,heartbeatAt:Date.now()});         await heartbeat();         heartbeatTimer = setInterval(() => { if (localStream) heartbeat().catch((error) => console.warn("Presence refresh failed:", error)); }, HEARTBEATMS);         watchIncomingCalls();         setStatus(Connected to ${selectedChannel});     } catch (error) {         console.error("Unable to join voice:", error);         localStream?.getTracks().forEach((track) => track.stop());         localStream = null;         joinButton.textContent = "Join Voice";         muteButton.disabled = true;         setStatus(error.code === "permission-denied" ? "Firestore denied voice presence. Publish firestore.rules." : error.name === "NotAllowedError" ? "Microphone permission blocked. Allow it in your browser settings." : "Could not join voice. Check microphone access and Firestore rules.");     } finally { joinButton.disabled = false; } } async function leaveVoice() {     const oldRoom = roomId;     const oldUid = user?.uid;     if (heartbeatTimer) clearInterval(heartbeatTimer);     heartbeatTimer = null;     stopCalls?.(); stopCalls = null;     stopParticipants?.(); stopParticipants = null;     localStream?.getTracks().forEach((track) => track.stop());     localStream = null;     closeAllPeers();     incomingCalls.clear(); participants.clear();     muted = false;     muteButton.disabled = true; muteButton.textContent = "Mute";     joinButton.textContent = "Join Voice";     renderParticipants();     await Promise.allSettled([…outgoingCalls.values()].map((callRef) => deleteDoc(callRef)));     outgoingCalls.clear();     if (oldRoom && oldUid) {         try { await deleteDoc(doc(db, "voiceRooms", oldRoom, "participants", oldUid)); }         catch (error) { console.warn("Presence will expire after heartbeat timeout:", error); }     }     setStatus(selectedChannel ? Left ${selectedChannel} : "Not connected"); } function toggleMute() {     if (!localStream) return;     muted = !muted;     localStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });     muteButton.textContent = muted ? "Unmute" : "Mute";     setStatus(${muted ? "Muted in" : "Connected to"} ${selectedChannel}); }

channelItems.forEach((channel) => {     channel.addEventListener("click", async (event) => {         if (event.target.closest("#voicePanel")) return;         const nextName = channel.dataset.voiceName || channel.textContent.trim();         const nextRoom = makeRoomId(nextName);         if (localStream && nextRoom !== roomId) await leaveVoice();         channelItems.forEach((item) => item.classList.toggle("active", item === channel));         selectedChannel = nextName;         roomId = nextRoom;         if (panel && panel.parentElement !== channel) channel.appendChild(panel);         if (panel) panel.hidden = false;         watchParticipants();         if (localStream) watchIncomingCalls();         setStatus(localStream ? Connected to ${selectedChannel} : Selected ${selectedChannel} — join to talk);     }); }); joinButton?.addEventListener("click", (event) => { event.stopPropagation(); void joinOrLeave(); }); muteButton?.addEventListener("click", (event) => { event.stopPropagation(); toggleMute(); }); onAuthStateChanged(auth, (nextUser) => {     user = nextUser;     if (!nextUser) { if (localStream) void leaveVoice(); return; }     if (selectedChannel) watchParticipants(); }); window.leaveVoiceChat = leaveVoice; window.addEventListener("pagehide", () => {     if (heartbeatTimer) clearInterval(heartbeatTimer);     localStream?.getTracks().forEach((track) => track.stop());     closeAllPeers(); });voice-ui.js// Keep voice controls and the participant list attached to the channel they belong to.const panel = document.getElementById("voicePanel");const channels = […document.querySelectorAll(".voice-channel")];channels.forEach((channel) => {    channel.addEventListener("click", () => {        // script.js also handles this click and marks the selected channel active.        queueMicrotask(() => {            const selectedChannel = document.querySelector(".voice-channel.active");            if (!selectedChannel || !panel) return;            selectedChannel.appendChild(panel);            panel.hidden = false;        });    });});dashboard.html                       
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">

<link rel="stylesheet" href="style.css?v=10">
<link rel="stylesheet" href="luxury.css?v=9">
<link rel="stylesheet" href="branding-polish.css?v=9">
<link rel="stylesheet" href="dm.css?v=1">



Diamond Lounge Direct Messages                           

                 🎮                                                                       ＋                       

MAIN COMMUNITY                      

image                         
VIP-LOUNGE
 Lounge is open                 
TEXT CHANNELS
- # general
- # gaming
- # streaming
- # announcements
VOICE LOUNGES
- 🔊 General Voice
- 🎮 Gaming Voice
- ♫ Music Lounge
- ✦ AI Hangout
Log out                                   

Member

Available

# general

A little space to share what matters.

✦ VIP-LOUNGE             

＋                                                      Send             
COMMUNITY
- Member                     you
SHARED MOMENTS
Images, GIFs, videos and audio shared by the community.

Nothing shared here yet.

DIAMOND LOUNGE ✦

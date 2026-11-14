import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const HEARTBEAT_INTERVAL_MS = 10000;
const PRESENCE_TIMEOUT_MS = 45000;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let currentUser = "Member";
let currentUid = null;
let chatReady = false;
let selectedVoiceChannel = null;
let selectedRoomId = null;
let localVoiceStream = null;
let voiceMuted = false;
let joinedVoice = false;
let sessionId = null;
let heartbeatTimer = null;
let stopParticipantsListener = null;
let stopCallsListener = null;
let participantsByUid = new Map();
const peers = new Map();
const outgoingCallRefs = new Map();
const pendingIncomingCalls = new Map();

const messagesElement = document.getElementById("messages");
const input = document.getElementById("messageInput");
const voiceStatus = document.getElementById("voiceStatus");
const voiceToggleBtn = document.getElementById("voiceToggleBtn");
const muteToggleBtn = document.getElementById("muteToggleBtn");
const voiceParticipantsElement = document.getElementById("voiceParticipants");
const voiceParticipantCount = document.getElementById("voiceParticipantCount");
const remoteAudioContainer = document.getElementById("remoteAudioContainer");

function showVoiceStatus(message) {
    if (voiceStatus) voiceStatus.textContent = message;
}

function roomIdFor(channelName) {
    return channelName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderVoiceParticipants() {
    if (!voiceParticipantsElement) return;

    const now = Date.now();
    const active = [...participantsByUid.values()]
        .filter((participant) => now - participant.heartbeatAt < PRESENCE_TIMEOUT_MS)
        .sort((a, b) => a.name.localeCompare(b.name));

    voiceParticipantsElement.replaceChildren();
    if (voiceParticipantCount) voiceParticipantCount.textContent = String(active.length);

    if (active.length === 0) {
        const empty = document.createElement("li");
        empty.className = "voice-empty";
        empty.textContent = "No one is in this voice channel yet.";
        voiceParticipantsElement.appendChild(empty);
        return;
    }

    active.forEach((participant) => {
        const item = document.createElement("li");
        item.className = "voice-participant";
        item.dataset.uid = participant.uid;

        const indicator = document.createElement("span");
        indicator.className = "voice-speaking-indicator";
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = "●";

        const name = document.createElement("span");
        name.className = "voice-participant-name";
        name.textContent = participant.name + (participant.uid === currentUid ? " (you)" : "");

        item.append(indicator, name);
        voiceParticipantsElement.appendChild(item);
    });
}

function closePeer(uid) {
    const peer = peers.get(uid);
    if (!peer) return;

    peer.stopCallListener?.();
    peer.stopCandidatesListener?.();
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();
    peer.audioElement?.remove();
    peers.delete(uid);
}

function closeAllPeers() {
    [...peers.keys()].forEach(closePeer);
    outgoingCallRefs.clear();
    pendingIncomingCalls.clear();
}

function addLocalTracks(pc) {
    localVoiceStream?.getAudioTracks().forEach((track) => pc.addTrack(track, localVoiceStream));
}

function createPeer(uid, name, callRef = null) {
    const existing = peers.get(uid);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { pc, name, callRef, stopCallListener: null, stopCandidatesListener: null, remoteCandidateIds: new Set(), pendingCandidates: [] };
    peers.set(uid, peer);
    addLocalTracks(pc);

    pc.ontrack = (event) => {
        let audioElement = peer.audioElement;
        if (!audioElement) {
            audioElement = document.createElement("audio");
            audioElement.autoplay = true;
            audioElement.playsInline = true;
            audioElement.dataset.peerUid = uid;
            remoteAudioContainer?.appendChild(audioElement);
            peer.audioElement = audioElement;
        }
        audioElement.srcObject = event.streams[0];
        audioElement.play().catch((error) => {
            console.warn("Remote audio playback needs user interaction:", error);
            showVoiceStatus("Connected. Tap the page if your browser blocks audio playback.");
        });
    };

    pc.oniceconnectionstatechange = () => {
        if (["failed", "closed"].includes(pc.iceConnectionState)) closePeer(uid);
    };

    pc.onicecandidate = async (event) => {
        if (!event.candidate || !peer.callRef) return;
        try {
            await addDoc(collection(peer.callRef, "candidates"), {
                uid: currentUid,
                candidate: event.candidate.toJSON()
            });
        } catch (error) {
            console.error("Could not share an ICE candidate:", error);
        }
    };

    return peer;
}

function listenForRemoteCandidates(peer, callRef) {
    peer.callRef = callRef;
    peer.stopCandidatesListener?.();
    peer.stopCandidatesListener = onSnapshot(collection(callRef, "candidates"), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type !== "added" || peer.remoteCandidateIds.has(change.doc.id)) return;
            peer.remoteCandidateIds.add(change.doc.id);
            const data = change.doc.data();
            if (data.uid === currentUid || !data.candidate) return;

            const candidate = new RTCIceCandidate(data.candidate);
            if (!peer.pc.remoteDescription) {
                peer.pendingCandidates.push(candidate);
                return;
            }
            try {
                await peer.pc.addIceCandidate(candidate);
            } catch (error) {
                console.warn("Could not add remote ICE candidate:", error);
            }
        });
    }, (error) => console.error("Voice signaling candidate listener error:", error));
}

async function flushPendingCandidates(peer) {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) {
        try {
            await peer.pc.addIceCandidate(candidate);
        } catch (error) {
            console.warn("Could not add queued ICE candidate:", error);
        }
    }
}

async function createOutgoingCall(participant) {
    if (!joinedVoice || !localVoiceStream || currentUid.localeCompare(participant.uid) >= 0 || peers.has(participant.uid)) return;

    const roomRef = doc(db, "voiceRooms", selectedRoomId);
    const callRef = doc(collection(roomRef, "calls"));
    const peer = createPeer(participant.uid, participant.name, callRef);
    outgoingCallRefs.set(participant.uid, callRef);

    try {
        await setDoc(callRef, {
            callerUid: currentUid,
            callerSessionId: sessionId,
            calleeUid: participant.uid,
            calleeSessionId: participant.sessionId,
            offer: null,
            answer: null,
            createdAt: Date.now()
        });

        listenForRemoteCandidates(peer, callRef);
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        await updateDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } });

        peer.stopCallListener = onSnapshot(callRef, async (snapshot) => {
            if (!snapshot.exists()) {
                closePeer(participant.uid);
                return;
            }
            const answer = snapshot.data().answer;
            if (answer && !peer.pc.currentRemoteDescription) {
                try {
                    await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
                    await flushPendingCandidates(peer);
                } catch (error) {
                    console.error("Could not apply voice answer:", error);
                    closePeer(participant.uid);
                }
            }
        }, (error) => console.error("Voice call listener error:", error));
    } catch (error) {
        console.error("Could not start voice call:", error);
        closePeer(participant.uid);
        showVoiceStatus("Could not connect voice. Check Firestore rules and try again.");
    }
}

async function handleIncomingCall(callSnapshot) {
    const callId = callSnapshot.id;
    const callData = callSnapshot.data();
    const caller = participantsByUid.get(callData.callerUid);

    if (!joinedVoice || !caller || caller.sessionId !== callData.callerSessionId || callData.calleeSessionId !== sessionId || !callData.offer) return;
    if (peers.has(callData.callerUid)) return;

    const callRef = callSnapshot.ref;
    const peer = createPeer(callData.callerUid, caller.name, callRef);
    peer.callId = callId;

    try {
        listenForRemoteCandidates(peer, callRef);
        await peer.pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
        await flushPendingCandidates(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        await updateDoc(callRef, { answer: { type: answer.type, sdp: answer.sdp } });
    } catch (error) {
        console.error("Could not answer voice call:", error);
        closePeer(callData.callerUid);
    }
}

function processPendingCalls() {
    pendingIncomingCalls.forEach((snapshot) => {
        void handleIncomingCall(snapshot);
    });
}

function watchRoom(roomId) {
    stopParticipantsListener?.();
    stopCallsListener?.();
    closeAllPeers();
    participantsByUid = new Map();
    pendingIncomingCalls.clear();
    renderVoiceParticipants();

    const roomRef = doc(db, "voiceRooms", roomId);
    const participantsRef = collection(roomRef, "participants");
    stopParticipantsListener = onSnapshot(participantsRef, (snapshot) => {
        const nextParticipants = new Map();
        const now = Date.now();

        snapshot.forEach((participantDoc) => {
            const data = participantDoc.data();
            const heartbeatAt = Number(data.heartbeatAt || 0);
            if (data.uid && data.name && now - heartbeatAt < PRESENCE_TIMEOUT_MS) {
                nextParticipants.set(data.uid, {
                    uid: data.uid,
                    name: data.name,
                    sessionId: data.sessionId,
                    heartbeatAt
                });
            }
        });

        participantsByUid = nextParticipants;
        renderVoiceParticipants();

        [...peers.keys()].forEach((uid) => {
            if (!participantsByUid.has(uid)) closePeer(uid);
        });

        if (joinedVoice) {
            participantsByUid.forEach((participant) => {
                if (participant.uid !== currentUid && currentUid.localeCompare(participant.uid) < 0) {
                    void createOutgoingCall(participant);
                }
            });
            processPendingCalls();
        }
    }, (error) => {
        console.error("Voice participant listener error:", error);
        showVoiceStatus("Could not load voice members. Check Firestore rules.");
    });

    if (joinedVoice) listenForCalls(roomRef);
}

function listenForCalls(roomRef) {
    stopCallsListener?.();
    const callsQuery = query(collection(roomRef, "calls"), where("calleeUid", "==", currentUid));
    stopCallsListener = onSnapshot(callsQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "removed") {
                pendingIncomingCalls.delete(change.doc.id);
                const uid = change.doc.data()?.callerUid;
                if (uid) closePeer(uid);
                return;
            }
            pendingIncomingCalls.set(change.doc.id, change.doc);
        });
        processPendingCalls();
    }, (error) => {
        console.error("Voice call signaling listener error:", error);
        showVoiceStatus("Voice signaling is blocked. Publish the provided Firestore rules.");
    });
}

async function joinVoice() {
    if (!selectedRoomId || !currentUid) {
        showVoiceStatus("Select a voice channel first.");
        return;
    }
    if (joinedVoice) {
        await leaveVoice();
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        showVoiceStatus("Microphone access requires HTTPS and a supported browser.");
        return;
    }

    voiceToggleBtn.disabled = true;
    showVoiceStatus("Requesting microphone permission...");
    try {
        localVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        joinedVoice = true;
        voiceMuted = false;
        muteToggleBtn.disabled = false;
        muteToggleBtn.textContent = "Mute";
        voiceToggleBtn.textContent = "Leave Voice";

        const participantRef = doc(db, "voiceRooms", selectedRoomId, "participants", currentUid);
        const publishPresence = () => setDoc(participantRef, {
            uid: currentUid,
            name: currentUser,
            sessionId,
            heartbeatAt: Date.now()
        });

        await publishPresence();
        heartbeatTimer = window.setInterval(() => {
            if (joinedVoice) publishPresence().catch((error) => console.warn("Voice presence heartbeat failed:", error));
        }, HEARTBEAT_INTERVAL_MS);

        listenForCalls(doc(db, "voiceRooms", selectedRoomId));
        showVoiceStatus(`Connected to ${selectedVoiceChannel}`);
    } catch (error) {
        console.error("Could not join voice:", error);
        localVoiceStream?.getTracks().forEach((track) => track.stop());
        localVoiceStream = null;
        joinedVoice = false;
        voiceToggleBtn.textContent = "Join Voice";
        muteToggleBtn.disabled = true;
        showVoiceStatus(error.code === "permission-denied"
            ? "Firestore denied voice presence. Publish the Firestore rules first."
            : "Could not join. Allow microphone access and check the connection.");
    } finally {
        voiceToggleBtn.disabled = false;
    }
}

async function leaveVoice() {
    const roomId = selectedRoomId;
    const uid = currentUid;
    joinedVoice = false;

    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    stopCallsListener?.();
    stopCallsListener = null;
    closeAllPeers();
    localVoiceStream?.getTracks().forEach((track) => track.stop());
    localVoiceStream = null;
    voiceMuted = false;
    muteToggleBtn.disabled = true;
    muteToggleBtn.textContent = "Mute";
    voiceToggleBtn.textContent = "Join Voice";

    const refs = [...outgoingCallRefs.values()];
    await Promise.allSettled(refs.map((callRef) => deleteDoc(callRef)));
    if (roomId && uid) {
        try {
            await deleteDoc(doc(db, "voiceRooms", roomId, "participants", uid));
        } catch (error) {
            console.warn("Could not remove voice presence immediately:", error);
        }
    }
    renderVoiceParticipants();
    showVoiceStatus(selectedVoiceChannel ? `Left ${selectedVoiceChannel}` : "Not connected");
}

function toggleMute() {
    if (!localVoiceStream) return;
    voiceMuted = !voiceMuted;
    localVoiceStream.getAudioTracks().forEach((track) => { track.enabled = !voiceMuted; });
    muteToggleBtn.textContent = voiceMuted ? "Unmute" : "Mute";
    showVoiceStatus(`${voiceMuted ? "Muted in" : "Connected to"} ${selectedVoiceChannel}`);
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
    if (profileName) profileName.textContent = "💎 " + currentUser;
    if (currentUserElement) currentUserElement.textContent = "🟢 " + currentUser;

    if (!chatReady) {
        chatReady = true;
        loadMessages();
    }
});

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
            author.textContent = (data.username || "Member") + ": ";
            message.append(author, document.createTextNode(data.text || ""));
            messagesElement.appendChild(message);
        });
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }, (error) => {
        console.error("Firestore error:", error);
        if (messagesElement) messagesElement.textContent = "Unable to load messages. Please check your connection.";
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
            text,
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
        if (joinedVoice) await leaveVoice();
        await signOut(auth);
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout error:", error);
        alert("Unable to log out.");
    }
};

if (input) {
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") window.sendMessage();
    });
}

document.querySelectorAll(".voice-channel").forEach((channel) => {
    channel.addEventListener("click", async () => {
        const nextName = channel.dataset.voiceName || channel.textContent.trim();
        const nextRoomId = roomIdFor(nextName);
        if (joinedVoice && nextRoomId !== selectedRoomId) await leaveVoice();

        document.querySelectorAll(".voice-channel").forEach((item) => item.classList.toggle("active", item === channel));
        selectedVoiceChannel = nextName;
        selectedRoomId = nextRoomId;
        watchRoom(selectedRoomId);
        showVoiceStatus(joinedVoice ? `Connected to ${selectedVoiceChannel}` : `Selected ${selectedVoiceChannel} — join to talk`);
    });
});

voiceToggleBtn?.addEventListener("click", joinVoice);
muteToggleBtn?.addEventListener("click", toggleMute);

console.log("Diamond Lounge chat and WebRTC voice ready.");

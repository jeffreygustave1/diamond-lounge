import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
    addDoc, collection, deleteDoc, doc, onSnapshot, query,
    setDoc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const HEARTBEAT_MS = 10000;
const STALE_AFTER_MS = 35000;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const panel = document.getElementById("voicePanel");
const channelItems = [...document.querySelectorAll(".voice-channel")];
const joinButton = document.getElementById("joinVoiceButton");
const muteButton = document.getElementById("muteToggleBtn");
const cameraButton = document.getElementById("cameraToggleBtn");
const screenButton = document.getElementById("screenToggleBtn");
const leaveButton = document.getElementById("leaveVoiceButton");
const controlsRow = document.getElementById("voiceControls");
const leaveRow = document.getElementById("voiceLeaveRow");
const joinSlots = [...document.querySelectorAll(".voice-join-slot")];
const countElements = [...document.querySelectorAll("[data-voice-count]")];
const stopCounts = new Map();
const statusElement = document.getElementById("voiceStatus");
const participantsElement = document.getElementById("voiceParticipants");
const countElement = document.getElementById("voiceParticipantCount");
const audioContainer = document.getElementById("remoteAudioContainer");
const videoGrid = document.getElementById("remoteVideoGrid");

let user = null;
let selectedChannel = null;
let roomId = null;
let sessionId = null;
let localStream = null;
let cameraStream = null;
let screenStream = null;
let heartbeatTimer = null;
let stopParticipants = null;
let stopCalls = null;
let muted = false;
let cameraOn = false;
let screenOn = false;

const participants = new Map();
const peers = new Map();
const outgoingCalls = new Map();
const incomingCalls = new Map();
const mediaTracks = new Map();

function setStatus(text) {
    if (statusElement) statusElement.textContent = text;
}

/* Count the people actually connected to each voice lounge. */
function watchChannelCounts() {
    countElements.forEach((element) => {
        const name = element.dataset.voiceCount;
        if (!name) return;

        const room = makeRoomId(name);

        stopCounts.get(room)?.();
        stopCounts.delete(room);

        const unsubscribe = onSnapshot(
            collection(db, "voiceRooms", room, "participants"),
            (snapshot) => {
                let live = 0;

                snapshot.forEach((entry) => {
                    const heartbeatAt = Number(entry.data()?.heartbeatAt || 0);
                    if (Date.now() - heartbeatAt < STALE_AFTER_MS) live += 1;
                });

                element.textContent =
                    live === 0 ? "No one in voice"
                    : live === 1 ? "1 in voice"
                    : `${live} in voice`;

                element.classList.toggle("has-people", live > 0);
            },
            () => {
                element.textContent = "No one in voice";
            }
        );

        stopCounts.set(room, unsubscribe);
    });
}

function makeRoomId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function setPressed(button, on) {
    if (button) button.setAttribute("aria-pressed", String(on));
}

/* ==========================================
   PARTICIPANT LIST
========================================== */

function renderParticipants() {
    if (!participantsElement) return;

    const online = [...participants.values()]
        .filter((p) => Date.now() - p.heartbeatAt < STALE_AFTER_MS)
        .sort((a, b) => a.name.localeCompare(b.name));

    participantsElement.replaceChildren();

    if (countElement) countElement.textContent = String(online.length);

    if (!online.length) {
        const empty = document.createElement("li");
        empty.className = "voice-empty";
        empty.textContent = "No one is here yet.";
        participantsElement.appendChild(empty);
        return;
    }

    online.forEach((person) => {
        const item = document.createElement("li");
        item.className = "voice-participant";

        const dot = document.createElement("i");
        dot.className = "voice-speaking-indicator";

        const label = document.createElement("span");
        label.textContent = `${person.name}${person.uid === user?.uid ? " (you)" : ""}`;

        const badges = document.createElement("em");
        badges.className = "voice-badges";
        if (person.cameraOn) badges.textContent += "\ud83d\udcf7";
        if (person.screenOn) badges.textContent += "\ud83d\udda5\ufe0f";

        item.append(dot, label, badges);
        participantsElement.appendChild(item);
    });
}

/* ==========================================
   PEER CONNECTIONS
========================================== */

function closePeer(uid) {
    const peer = peers.get(uid);
    if (!peer) return;

    peer.unsubCall?.();
    peer.unsubCandidates?.();
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();
    peer.audio?.remove();
    peers.delete(uid);
}

function closeAllPeers() {
    [...peers.keys()].forEach(closePeer);
}

function attachRemoteVideo(uid, label, stream) {
    if (!videoGrid || !stream) return;

    const tileId = `tile-${uid}`;
    let tile = document.getElementById(tileId);

    if (!tile) {
        tile = document.createElement("figure");
        tile.id = tileId;
        tile.className = "remote-video-tile";

        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;

        const caption = document.createElement("figcaption");
        caption.textContent = label;

        tile.append(video, caption);
        videoGrid.appendChild(tile);
    }

    const video = tile.querySelector("video");
    if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
    }
}

function makePeer(person, callRef) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const peer = {
        pc, callRef, audio: null,
        unsubCall: null, unsubCandidates: null,
        candidateIds: new Set(), waitingCandidates: []
    };

    peers.set(person.uid, peer);

    const senders = {};

    localStream?.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    if (cameraStream) {
        cameraStream.getVideoTracks().forEach((track) => {
            senders.camera = pc.addTrack(track, cameraStream);
        });
    }

    if (screenStream) {
        screenStream.getVideoTracks().forEach((track) => {
            senders.screen = pc.addTrack(track, screenStream);
        });
    }

    peer.senders = senders;

    pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;

        const isVideo = event.track.kind === "video";

        if (isVideo) {
            const label = person.name;
            attachRemoteVideo(person.uid, label, stream);
            return;
        }

        if (!peer.audio) {
            peer.audio = document.createElement("audio");
            peer.audio.autoplay = true;
            peer.audio.playsInline = true;
            peer.audio.dataset.peer = person.uid;
            audioContainer?.appendChild(peer.audio);
        }

        peer.audio.srcObject = stream;
        peer.audio.play().catch(() => {
            setStatus("Voice connected. Click the page once if audio is blocked.");
        });
    };

    pc.onicecandidate = async (event) => {
        if (!event.candidate || !user) return;
        try {
            await addDoc(collection(callRef, "candidates"), {
                uid: user.uid,
                candidate: event.candidate.toJSON()
            });
        } catch (error) {
            console.error("ICE candidate write failed:", error);
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
            setStatus("Voice connection failed. This network may need a TURN server.");
        }
        if (["failed", "closed"].includes(pc.connectionState)) {
            closePeer(person.uid);
        }
    };

    peer.unsubCandidates = onSnapshot(
        collection(callRef, "candidates"),
        (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type !== "added" || peer.candidateIds.has(change.doc.id)) return;
                peer.candidateIds.add(change.doc.id);

                const data = change.doc.data();
                if (data.uid === user?.uid || !data.candidate) return;

                const candidate = new RTCIceCandidate(data.candidate);
                if (!pc.remoteDescription) {
                    peer.waitingCandidates.push(candidate);
                    return;
                }

                try {
                    await pc.addIceCandidate(candidate);
                } catch (error) {
                    console.warn("Could not add ICE candidate:", error);
                }
            });
        },
        (error) => console.error("Candidate listener failed:", error)
    );

    return peer;
}

async function addWaitingCandidates(peer) {
    for (const candidate of peer.waitingCandidates.splice(0)) {
        try {
            await peer.pc.addIceCandidate(candidate);
        } catch (error) {
            console.warn("Could not add queued ICE candidate:", error);
        }
    }
}

async function startOutgoingCall(person) {
    if (!user || !localStream || !roomId) return;
    if (peers.has(person.uid) || person.uid === user.uid) return;
    if (user.uid.localeCompare(person.uid) <= 0) return;

    const callRef = doc(collection(doc(db, "voiceRooms", roomId), "calls"));
    const peer = makePeer(person, callRef);
    outgoingCalls.set(person.uid, callRef);

    try {
        await setDoc(callRef, {
            callerUid: user.uid,
            callerSessionId: sessionId,
            calleeUid: person.uid,
            calleeSessionId: person.sessionId,
            offer: null,
            answer: null,
            createdAt: Date.now()
        });

        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);

        await updateDoc(callRef, {
            offer: { type: offer.type, sdp: offer.sdp }
        });

        peer.unsubCall = onSnapshot(callRef, async (snapshot) => {
            if (!snapshot.exists()) { closePeer(person.uid); return; }

            const answer = snapshot.data().answer;
            if (answer && !peer.pc.remoteDescription) {
                try {
                    await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
                    await addWaitingCandidates(peer);
                } catch (error) {
                    console.error("Could not apply answer:", error);
                    closePeer(person.uid);
                }
            }
        }, (error) => console.error("Call answer listener failed:", error));
    } catch (error) {
        console.error("Could not start voice call:", error);
        closePeer(person.uid);
        setStatus("Could not start voice. Check Firebase rules.");
    }
}

async function answerIncomingCall(callSnapshot) {
    const data = callSnapshot.data();
    const caller = participants.get(data.callerUid);

    if (!localStream || !caller) return;
    if (caller.sessionId !== data.callerSessionId) return;
    if (data.calleeSessionId !== sessionId) return;
    if (!data.offer || peers.has(data.callerUid)) return;

    const peer = makePeer(caller, callSnapshot.ref);

    try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        await addWaitingCandidates(peer);

        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);

        await updateDoc(callSnapshot.ref, {
            answer: { type: answer.type, sdp: answer.sdp }
        });
    } catch (error) {
        console.error("Could not answer voice call:", error);
        closePeer(data.callerUid);
    }
}

function processIncomingCalls() {
    incomingCalls.forEach((snapshot) => void answerIncomingCall(snapshot));
}

/* ==========================================
   PRESENCE + SIGNALLING
========================================== */

function watchParticipants() {
    if (!roomId) return;

    stopParticipants?.();
    stopParticipants = null;
    participants.clear();
    renderParticipants();

    stopParticipants = onSnapshot(
        collection(db, "voiceRooms", roomId, "participants"),
        (snapshot) => {
            const fresh = new Map();

            snapshot.forEach((entry) => {
                const data = entry.data();
                const heartbeatAt = Number(data.heartbeatAt || 0);
                if (!data.uid || !data.name) return;
                if (Date.now() - heartbeatAt >= STALE_AFTER_MS) return;

                fresh.set(data.uid, {
                    uid: data.uid,
                    name: data.name,
                    sessionId: data.sessionId,
                    heartbeatAt,
                    cameraOn: Boolean(data.cameraOn),
                    screenOn: Boolean(data.screenOn)
                });
            });

            participants.clear();
            fresh.forEach((value, key) => participants.set(key, value));
            renderParticipants();

            [...peers.keys()].forEach((uid) => {
                if (!participants.has(uid)) closePeer(uid);
            });

            if (localStream) {
                participants.forEach((person) => {
                    if (person.uid !== user?.uid) void startOutgoingCall(person);
                });
                processIncomingCalls();
            }
        },
        (error) => {
            console.error("Voice presence listener failed:", error);
            setStatus("Could not read voice members.");
        }
    );
}

function watchIncomingCalls() {
    if (!roomId || !user) return;

    stopCalls?.();
    stopCalls = null;

    stopCalls = onSnapshot(
        query(collection(db, "voiceRooms", roomId, "calls"), where("calleeUid", "==", user.uid)),
        (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "removed") {
                    incomingCalls.delete(change.doc.id);
                    const callerUid = change.doc.data()?.callerUid;
                    if (callerUid) closePeer(callerUid);
                } else {
                    incomingCalls.set(change.doc.id, change.doc);
                }
            });
            processIncomingCalls();
        },
        (error) => {
            console.error("Voice call listener failed:", error);
            setStatus("Voice signaling was denied by Firebase.");
        }
    );
}

/* ==========================================
   MEDIA — MICROPHONE, CAMERA, SCREEN
========================================== */

async function refreshPresenceFlags() {
    if (!roomId || !user || !localStream) return;

    try {
        await setDoc(
            doc(db, "voiceRooms", roomId, "participants", user.uid),
            {
                uid: user.uid,
                name: (user.displayName || "Member").slice(0, 80),
                sessionId,
                heartbeatAt: Date.now(),
                cameraOn,
                screenOn
            },
            { merge: true }
        );
    } catch (error) {
        console.warn("Presence flags could not be updated:", error);
    }
}

function getSender(peer, kind) {
    if (kind === "camera") {
        return peer.pc.getSenders().find((sender) => sender.track?.kind === "video" && sender.track === cameraStream?.getVideoTracks()[0]);
    }
    if (kind === "screen") {
        return peer.pc.getSenders().find((sender) => sender.track?.kind === "video" && sender.track === screenStream?.getVideoTracks()[0]);
    }
    return null;
}

async function renegotiateWith(uid) {
    const peer = peers.get(uid);
    if (!peer || !peer.callRef || !user) return;

    try {
        await setDoc(peer.callRef, {
            callerUid: user.uid,
            callerSessionId: sessionId,
            calleeUid: uid,
            calleeSessionId: participants.get(uid)?.sessionId || "",
            offer: null,
            answer: null,
            createdAt: Date.now()
        }, { merge: false });

        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);

        await updateDoc(peer.callRef, {
            offer: { type: offer.type, sdp: offer.sdp }
        });
    } catch (error) {
        console.warn("Could not renegotiate with", uid, error);
    }
}

async function toggleCamera() {
    if (!localStream) return;

    if (cameraOn) {
        cameraStream?.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        cameraOn = false;
        setPressed(cameraButton, false);
        if (cameraButton) cameraButton.querySelector(".voice-control-label").textContent = "Camera";

        peers.forEach((peer, uid) => {
            const sender = getSender(peer, "camera");
            if (sender) peer.pc.removeTrack(sender);
            void renegotiateWith(uid);
        });

        setStatus("Camera off");
        await refreshPresenceFlags();
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (error) {
        console.error("Camera permission failed:", error);
        setStatus("Camera permission was blocked.");
        return;
    }

    cameraOn = true;
    setPressed(cameraButton, true);
    if (cameraButton) cameraButton.querySelector(".voice-control-label").textContent = "Camera on";

    const track = cameraStream.getVideoTracks()[0];

    peers.forEach((peer, uid) => {
        peer.pc.addTrack(track, cameraStream);
        void renegotiateWith(uid);
    });

    setStatus("Camera on");
    await refreshPresenceFlags();
}

async function toggleScreen() {
    if (!localStream) return;

    if (screenOn) {
        screenStream?.getTracks().forEach((track) => track.stop());
        screenStream = null;
        screenOn = false;
        setPressed(screenButton, false);
        if (screenButton) screenButton.querySelector(".voice-control-label").textContent = "Screen";

        peers.forEach((peer, uid) => {
            const sender = getSender(peer, "screen");
            if (sender) peer.pc.removeTrack(sender);
            void renegotiateWith(uid);
        });

        setStatus("Screen share stopped");
        await refreshPresenceFlags();
        return;
    }

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
        });
    } catch (error) {
        if (error.name !== "NotAllowedError") {
            console.error("Screen share failed:", error);
        }
        setStatus("Screen share was cancelled.");
        return;
    }

    screenOn = true;
    setPressed(screenButton, true);
    if (screenButton) screenButton.querySelector(".voice-control-label").textContent = "Sharing";

    const track = screenStream.getVideoTracks()[0];

    track.onended = () => void toggleScreen();

    peers.forEach((peer, uid) => {
        peer.pc.addTrack(track, screenStream);
        void renegotiateWith(uid);
    });

    setStatus("Sharing your screen");
    await refreshPresenceFlags();
}

/* ==========================================
   JOIN / LEAVE
========================================== */

async function joinVoice() {
    if (!user) { setStatus("Sign in before joining a voice lounge."); return; }
    if (!selectedChannel || !roomId) { setStatus("Click a voice lounge first."); return; }
    if (localStream) return;

    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Microphone access requires HTTPS and a supported browser.");
        return;
    }

    joinButton.disabled = true;
    setStatus("Requesting microphone permission...");

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        muted = false;
        cameraOn = false;
        screenOn = false;

        // Only now does the control row appear.
        if (controlsRow) controlsRow.hidden = false;
        if (leaveRow) leaveRow.hidden = false;

        [muteButton, cameraButton, screenButton, leaveButton].forEach((button) => {
            if (button) button.disabled = false;
        });

        const presenceRef = doc(db, "voiceRooms", roomId, "participants", user.uid);
        const heartbeat = () => setDoc(presenceRef, {
            uid: user.uid,
            name: (user.displayName || "Member").slice(0, 80),
            sessionId,
            heartbeatAt: Date.now(),
            cameraOn,
            screenOn
        });

        await heartbeat();
        heartbeatTimer = setInterval(() => {
            if (localStream) heartbeat().catch((error) => console.warn("Presence refresh failed:", error));
        }, HEARTBEAT_MS);

        watchIncomingCalls();
        setStatus(`Connected to ${selectedChannel}`);
    } catch (error) {
        console.error("Unable to join voice:", error);

        localStream?.getTracks().forEach((track) => track.stop());
        localStream = null;

        setPressed(joinButton, false);

        [muteButton, cameraButton, screenButton, leaveButton].forEach((button) => {
            if (button) button.disabled = true;
        });

        setStatus(error.name === "NotAllowedError"
            ? "Microphone permission was blocked."
            : "Could not join voice. Check microphone access and Firebase rules.");
    } finally {
        joinButton.disabled = false;
    }
}

async function leaveVoice() {
    const oldRoom = roomId;
    const oldUid = user?.uid;

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;

    stopCalls?.(); stopCalls = null;
    stopParticipants?.(); stopParticipants = null;

    localStream?.getTracks().forEach((track) => track.stop());
    cameraStream?.getTracks().forEach((track) => track.stop());
    screenStream?.getTracks().forEach((track) => track.stop());

    localStream = null;
    cameraStream = null;
    screenStream = null;

    closeAllPeers();
    incomingCalls.clear();
    participants.clear();
    mediaTracks.clear();
    videoGrid?.replaceChildren();

    muted = false;
    cameraOn = false;
    screenOn = false;

    [muteButton, cameraButton, screenButton, leaveButton].forEach((button) => {
        if (button) button.disabled = true;
    });

    if (controlsRow) controlsRow.hidden = true;
    if (leaveRow) leaveRow.hidden = true;

    if (muteButton) {
        muteButton.querySelector(".voice-control-label").textContent = "Mute";
        setPressed(muteButton, false);
    }
    if (cameraButton) {
        cameraButton.querySelector(".voice-control-label").textContent = "Camera";
        setPressed(cameraButton, false);
    }
    if (screenButton) {
        screenButton.querySelector(".voice-control-label").textContent = "Screen";
        setPressed(screenButton, false);
    }
    if (joinButton) setPressed(joinButton, false);

    renderParticipants();

    await Promise.allSettled([...outgoingCalls.values()].map((callRef) => deleteDoc(callRef)));
    outgoingCalls.clear();

    if (oldRoom && oldUid) {
        try {
            await deleteDoc(doc(db, "voiceRooms", oldRoom, "participants", oldUid));
        } catch (error) {
            console.warn("Presence will expire after heartbeat timeout:", error);
        }
    }

    setStatus(selectedChannel ? `Left ${selectedChannel}` : "Not connected");
}

function toggleMute() {
    if (!localStream) return;

    muted = !muted;
    localStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });

    if (muteButton) {
        muteButton.querySelector(".voice-control-label").textContent = muted ? "Unmuted" : "Mute";
    }
    setPressed(muteButton, muted);

    setStatus(`${muted ? "Muted in" : "Connected to"} ${selectedChannel}`);
}

/* ==========================================
   CHANNEL SELECTION — CLICK AGAIN TO FOLD
========================================== */

channelItems.forEach((channel) => {
    channel.addEventListener("click", async (event) => {
        if (event.target.closest("#voicePanel")) return;

        const nextName = channel.dataset.voiceName || channel.textContent.trim();
        const nextRoom = makeRoomId(nextName);

        const isOpenChannel = channel.classList.contains("active") && panel && !panel.hidden;

        if (isOpenChannel) {
            if (localStream) await leaveVoice();

            channel.classList.remove("active");
            channel.setAttribute("aria-expanded", "false");
            if (panel) panel.hidden = true;
            if (controlsRow) controlsRow.hidden = true;
            if (leaveRow) leaveRow.hidden = true;

            channel.closest(".voice-row")
                ?.querySelector(".voice-join-slot")
                ?.setAttribute("hidden", "");

            stopParticipants?.(); stopParticipants = null;
            stopCalls?.(); stopCalls = null;

            selectedChannel = null;
            roomId = null;
            return;
        }

        if (localStream && nextRoom !== roomId) await leaveVoice();

        channelItems.forEach((item) => {
            const active = item === channel;
            item.classList.toggle("active", active);
            item.setAttribute("aria-expanded", String(active));
        });

// Show the Join button beside whichever channel was selected.
joinSlots.forEach((slot) => { slot.hidden = true; });

const ownRow = channel.closest(".voice-row");
const ownSlot = ownRow?.querySelector(".voice-join-slot");

if (ownSlot) {
    ownSlot.hidden = false;

    // Move the single shared Join button into this channel.
    if (joinButton) ownSlot.appendChild(joinButton);
}
        selectedChannel = nextName;
        roomId = nextRoom;

       // Keep the shared control panel inside the selected channel row.
if (panel && ownRow && panel.parentElement !== ownRow) {
    ownRow.appendChild(panel);
}
        if (panel) panel.hidden = false;

        watchParticipants();
        if (localStream) watchIncomingCalls();

        setStatus(localStream
            ? `Connected to ${selectedChannel}`
            : `Selected ${selectedChannel} — join to talk`);
    });
});

joinButton?.addEventListener("click", (event) => { event.stopPropagation(); void joinVoice(); });
leaveButton?.addEventListener("click", (event) => { event.stopPropagation(); void leaveVoice(); });
muteButton?.addEventListener("click", (event) => { event.stopPropagation(); toggleMute(); });
cameraButton?.addEventListener("click", (event) => { event.stopPropagation(); void toggleCamera(); });
screenButton?.addEventListener("click", (event) => { event.stopPropagation(); void toggleScreen(); });

onAuthStateChanged(auth, (nextUser) => {
    user = nextUser;
    if (!nextUser) {
        stopCounts.forEach((stop) => stop());
        stopCounts.clear();
        if (localStream) void leaveVoice();
        return;
    }

    watchChannelCounts();
    if (selectedChannel) watchParticipants();
});

window.leaveVoiceChat = leaveVoice;

window.addEventListener("pagehide", () => {
    stopCounts.forEach((stop) => stop());
    stopCounts.clear();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    localStream?.getTracks().forEach((track) => track.stop());
    cameraStream?.getTracks().forEach((track) => track.stop());
    screenStream?.getTracks().forEach((track) => track.stop());
    closeAllPeers();
});

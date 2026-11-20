import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

/* ==========================================
   SETTINGS
========================================== */

const HEARTBEAT_MS = 10000;
const STALE_AFTER_MS = 35000;

const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" }
];

/* ==========================================
   DOM ELEMENTS
========================================== */

const panel = document.getElementById("voicePanel");

const channelItems = [
    ...document.querySelectorAll(".voice-channel")
];

const joinButton = document.getElementById("joinVoiceButton");
const muteButton = document.getElementById("muteToggleBtn");
const cameraButton = document.getElementById("cameraToggleBtn");
const screenButton = document.getElementById("screenToggleBtn");
const leaveButton = document.getElementById("leaveVoiceButton");

const controlsRow = document.getElementById("voiceControls");
const leaveRow = document.getElementById("voiceLeaveRow");

const joinSlots = [
    ...document.querySelectorAll(".voice-join-slot")
];

const countElements = [
    ...document.querySelectorAll("[data-voice-count]")
];

const statusElement = document.getElementById("voiceStatus");
const participantsElement = document.getElementById("voiceParticipants");
const countElement = document.getElementById("voiceParticipantCount");

const audioContainer = document.getElementById("remoteAudioContainer");
const videoGrid = document.getElementById("remoteVideoGrid");
const screenShareStage = document.getElementById("screenShareStage");
const remoteScreenContainer = document.getElementById("remoteScreenContainer");

/* ==========================================
   STATE
========================================== */

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
let deafened = false;
let raisedHand = false;
let outputVolume = 1;
let joining = false;
let activeVoiceProfile = {};

const participants = new Map();
const peers = new Map();
const outgoingCalls = new Map();
const incomingCalls = new Map();
const stopCounts = new Map();

/* ==========================================
   JOIN / LEAVE SOUND TRACKING
========================================== */

let previousVoiceMembers = new Set();
let voiceSnapshotInitialized = false;

/* ==========================================
   GENERAL HELPERS
========================================== */

function publishVoiceUiState() {
    const detail = {
        connected: Boolean(localStream),
        joining,
        muted,
        cameraOn,
        screenOn,
        deafened,
        raisedHand,
        selectedChannel,
        roomId,
        status: statusElement?.textContent || "",
        outputVolume
    };
    window.dispatchEvent(new CustomEvent("diamond-voice-state", { detail }));
}

function setStatus(message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
    publishVoiceUiState();
}

function makeRoomId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function setPressed(button, on) {
    if (button) {
        button.setAttribute("aria-pressed", String(on));
    }
}

function setButtonLabel(button, text) {
    const label = button?.querySelector(".voice-control-label");

    if (label) {
        label.textContent = text;
    }
}

/* ==========================================
   VOICE CHANNEL COUNTS
========================================== */

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
                    const heartbeatAt = Number(
                        entry.data()?.heartbeatAt || 0
                    );

                    if (Date.now() - heartbeatAt < STALE_AFTER_MS) {
                        live++;
                    }
                });

                element.textContent =
                    live === 0
                        ? "No one in voice"
                        : live === 1
                            ? "1 in voice"
                            : `${live} in voice`;

                element.classList.toggle("has-people", live > 0);
            },

            (error) => {
                console.error("Voice count listener failed:", error);
                element.textContent = "No one in voice";
            }
        );

        stopCounts.set(room, unsubscribe);
    });
}

/* ==========================================
   PARTICIPANT LIST
========================================== */

function renderParticipants() {
    if (!participantsElement) return;

    const online = [...participants.values()]
        .filter((person) => {
            return Date.now() - person.heartbeatAt < STALE_AFTER_MS;
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    participantsElement.replaceChildren();

    if (countElement) {
        countElement.textContent = String(online.length);
    }

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

        label.textContent =
            `${person.name}${person.uid === user?.uid ? " (you)" : ""}`;

        const badges = document.createElement("em");
        badges.className = "voice-badges";

        if (person.cameraOn) {
            badges.textContent += "📷";
        }

        if (person.screenOn) {
            badges.textContent += "🖥️";
        }

        item.append(dot, label, badges);
        participantsElement.appendChild(item);
    });
}

/* ==========================================
   REMOTE VIDEO
========================================== */

function attachRemoteVideo(uid, label, stream, kind = "camera") {
    if (!stream) return;
    const callTile = kind === "camera" ? window.diamondVoiceTileRoots?.get(uid) : null;
    const destination = callTile || (kind === "screen" ? remoteScreenContainer : videoGrid);
    if (!destination) return;

    const tileId = "tile-" + kind + "-" + uid;
    let tile = document.getElementById(tileId);
    if (!tile) {
        tile = document.createElement("figure");
        tile.id = tileId;
        tile.className = callTile
            ? "remote-video-tile remote-video-camera created-server-embedded-video"
            : "remote-video-tile remote-video-" + kind;
        tile.hidden = true;

        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.objectFit = kind === "screen" ? "contain" : "cover";

        const caption = document.createElement("figcaption");
        caption.textContent = label + " — " + (kind === "screen" ? "Screen" : "Camera");
        tile.append(video, caption);
        destination.appendChild(tile);
        if (callTile) callTile.classList.add("has-camera");
    }

    const video = tile.querySelector("video");
    if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        video.play().catch(error => console.warn("Remote video playback blocked:", error));
    }
}

function syncLocalVoiceCameraPreview() {
    const callTile = user?.uid ? window.diamondVoiceTileRoots?.get(user.uid) : null;
    if (!callTile) return;

    const existing = callTile.querySelector("#local-voice-camera-preview");
    if (existing) existing.remove();

    if (!cameraOn || !cameraStream) {
        if (!callTile.querySelector(".created-server-embedded-video")) {
            callTile.classList.remove("has-camera");
        }
        return;
    }

    const video = document.createElement("video");
    video.id = "local-voice-camera-preview";
    video.className = "created-server-local-camera";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = cameraStream;
    callTile.append(video);
    callTile.classList.add("has-camera");
    video.play().catch(() => {});
}

/* ==========================================
   PEER CONNECTION CLEANUP
========================================== */

function closePeer(uid) {
    const peer = peers.get(uid);

    if (!peer) return;

    peers.delete(uid);

    peer.unsubCall?.();
    peer.unsubCandidates?.();

    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.onconnectionstatechange = null;

    peer.pc.close();

    peer.audio?.remove();

    const cameraTile = document.getElementById("tile-camera-" + uid);
    const cameraRoot = cameraTile?.parentElement;
    cameraTile?.remove();
    cameraRoot?.classList.remove("has-camera");
    document.getElementById("tile-screen-" + uid)?.remove();

    if (outgoingCalls.get(uid) === peer.callRef) {
        outgoingCalls.delete(uid);
    }
}

function closeAllPeers() {
    [...peers.keys()].forEach(closePeer);
}

/* ==========================================
   PEER CONNECTION CREATION
========================================== */

function makePeer(person, callRef) {
    const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS
    });

    const peer = {
        pc,
        callRef,
        audio: null,

        unsubCall: null,
        unsubCandidates: null,

        candidateIds: new Set(),
        waitingCandidates: [],

        videoTransceivers: [],
        videoSenders: {}
    };

    peers.set(person.uid, peer);

    // Add microphone audio.
    localStream?.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    // Reserve camera transceiver.
    const cameraTrack = cameraStream?.getVideoTracks()[0];

    const cameraTransceiver = cameraTrack
        ? pc.addTransceiver(cameraTrack, {
            direction: "sendrecv",
            streams: [cameraStream]
        })
        : pc.addTransceiver("video", {
            direction: "sendrecv"
        });

    // Reserve screen-sharing transceiver.
    const screenTrack = screenStream?.getVideoTracks()[0];

    const screenTransceiver = screenTrack
        ? pc.addTransceiver(screenTrack, {
            direction: "sendrecv",
            streams: [screenStream]
        })
        : pc.addTransceiver("video", {
            direction: "sendrecv"
        });

    peer.videoTransceivers = [
        cameraTransceiver,
        screenTransceiver
    ];

    peer.videoSenders = {
        camera: cameraTransceiver.sender,
        screen: screenTransceiver.sender
    };

    /* ======================================
       INCOMING MEDIA
    ====================================== */

    pc.ontrack = (event) => {
        console.log("REMOTE TRACK RECEIVED:", {
            kind: event.track.kind,
            id: event.track.id,
            muted: event.track.muted,
            transceiverMid: event.transceiver.mid,
            transceiverIndex: peer.videoTransceivers.indexOf(event.transceiver)
        });

        if (event.track.kind === "video") {
            const videoIndex =
                peer.videoTransceivers.indexOf(event.transceiver);

            const kind = videoIndex === 1 ? "screen" : "camera";

            const stream = event.streams[0] ||
                new MediaStream([event.track]);

            attachRemoteVideo(
                person.uid,
                person.name,
                stream,
                kind
            );

            const tile = document.getElementById(
                `tile-${kind}-${person.uid}`
            );

            event.track.onunmute = () => {
                if (tile) tile.hidden = false;

                if (kind === "screen" && screenShareStage) {
                    screenShareStage.hidden = false;
                }
            };

            event.track.onmute = () => {
                if (tile) tile.hidden = true;

                if (kind === "screen" && screenShareStage) {
                    screenShareStage.hidden = true;
                }
            };

            if (!event.track.muted && tile) {
                tile.hidden = false;

                if (kind === "screen" && screenShareStage) {
                    screenShareStage.hidden = false;
                }
            }

            return;
        }

        if (!peer.audio) {
            peer.audio = document.createElement("audio");

            peer.audio.autoplay = true;
            peer.audio.playsInline = true;
            peer.audio.dataset.peer = person.uid;
            peer.audio.muted = deafened;
            peer.audio.volume = outputVolume;

            audioContainer?.appendChild(peer.audio);
        }

        const audioStream = event.streams[0] ||
            new MediaStream([event.track]);

        peer.audio.srcObject = audioStream;

        peer.audio.play().catch(() => {
            setStatus(
                "Voice connected. Click the page once if audio is blocked."
            );
        });
    };

    /* ======================================
       OUTGOING ICE CANDIDATES
    ====================================== */

    pc.onicecandidate = async (event) => {
        if (!event.candidate || !user) return;

        try {
            await addDoc(
                collection(callRef, "candidates"),
                {
                    uid: user.uid,
                    candidate: event.candidate.toJSON()
                }
            );
        } catch (error) {
            console.error("ICE candidate write failed:", error);
        }
    };

    /* ======================================
       CONNECTION STATUS
    ====================================== */

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
            setStatus(`Voice connected to ${person.name}`);
        }

        if (pc.connectionState === "failed") {
            setStatus(
                "Voice connection failed. This network may need a TURN server."
            );
        }

        if (["failed", "closed"].includes(pc.connectionState)) {
            closePeer(person.uid);
        }
    };

    // IMPORTANT:
    // Do not start the candidate listener here.
    // The outgoing call document must exist first.
    return peer;
}

/* ==========================================
   LISTEN FOR REMOTE ICE CANDIDATES
========================================== */

function watchPeerCandidates(peer, person) {
    peer.unsubCandidates?.();

    peer.unsubCandidates = onSnapshot(
        collection(peer.callRef, "candidates"),

        (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (
                    change.type !== "added" ||
                    peer.candidateIds.has(change.doc.id)
                ) {
                    return;
                }

                peer.candidateIds.add(change.doc.id);

                const data = change.doc.data();

                // Ignore candidates created by this user.
                if (
                    data.uid === user?.uid ||
                    !data.candidate
                ) {
                    return;
                }

                const candidate = new RTCIceCandidate(
                    data.candidate
                );

                // Queue candidates until the remote description exists.
                if (!peer.pc.remoteDescription) {
                    peer.waitingCandidates.push(candidate);
                    return;
                }

                try {
                    await peer.pc.addIceCandidate(candidate);
                } catch (error) {
                    console.warn(
                        "Could not add ICE candidate:",
                        error
                    );
                }
            });
        },

        (error) => {
            console.error(
                `Candidate listener failed for ${person.name}:`,
                error
            );
        }
    );
}

/* ==========================================
   APPLY WAITING ICE CANDIDATES
========================================== */

async function addWaitingCandidates(peer) {
    for (const candidate of peer.waitingCandidates.splice(0)) {
        try {
            await peer.pc.addIceCandidate(candidate);
        } catch (error) {
            console.warn(
                "Could not add queued ICE candidate:",
                error
            );
        }
    }
}

/* ==========================================
   START OUTGOING CALL
========================================== */

async function startOutgoingCall(person) {
    if (!user || !localStream || !roomId) return;

    if (peers.has(person.uid)) return;
    if (person.uid === user.uid) return;

    // Only one side creates the call.
    if (user.uid.localeCompare(person.uid) <= 0) return;

    const callRef = doc(
        collection(doc(db, "voiceRooms", roomId), "calls")
    );

    const peer = makePeer(person, callRef);

    outgoingCalls.set(person.uid, callRef);

    try {
        // Create the parent call document FIRST.
        await setDoc(callRef, {
            callerUid: user.uid,
            callerSessionId: sessionId,

            calleeUid: person.uid,
            calleeSessionId: person.sessionId,

            offer: null,
            answer: null,

            createdAt: Date.now()
        });

        // Start listening only after the call document exists.
        watchPeerCandidates(peer, person);

        const offer = await peer.pc.createOffer();

        await peer.pc.setLocalDescription(offer);

        await updateDoc(callRef, {
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });

        peer.unsubCall = onSnapshot(
            callRef,

            async (snapshot) => {
                if (!snapshot.exists()) {
                    closePeer(person.uid);
                    return;
                }

                const answer = snapshot.data().answer;

                if (answer && !peer.pc.remoteDescription) {
                    try {
                        await peer.pc.setRemoteDescription(
                            new RTCSessionDescription(answer)
                        );

                        await addWaitingCandidates(peer);
                    } catch (error) {
                        console.error(
                            "Could not apply answer:",
                            error
                        );

                        closePeer(person.uid);
                    }
                }
            },

            (error) => {
                console.error(
                    "Call answer listener failed:",
                    error
                );
            }
        );

    } catch (error) {
        console.error("Could not start voice call:", error);

        closePeer(person.uid);

        setStatus(
            "Could not start voice. Check Firebase rules."
        );
    }
}

/* ==========================================
   ANSWER INCOMING CALL
========================================== */

async function answerIncomingCall(callSnapshot) {
    const data = callSnapshot.data();

    const caller = participants.get(data.callerUid);

    if (!localStream || !caller) return;

    if (caller.sessionId !== data.callerSessionId) return;
    if (data.calleeSessionId !== sessionId) return;

    if (!data.offer || peers.has(data.callerUid)) return;

    const peer = makePeer(caller, callSnapshot.ref);

    try {
        // The incoming call document already exists.
        watchPeerCandidates(peer, caller);

        await peer.pc.setRemoteDescription(
            new RTCSessionDescription(data.offer)
        );

        await addWaitingCandidates(peer);

        const answer = await peer.pc.createAnswer();

        await peer.pc.setLocalDescription(answer);

        await updateDoc(callSnapshot.ref, {
            answer: {
                type: answer.type,
                sdp: answer.sdp
            }
        });

    } catch (error) {
        console.error("Could not answer voice call:", error);

        closePeer(data.callerUid);
    }
}

function processIncomingCalls() {
    incomingCalls.forEach((snapshot) => {
        void answerIncomingCall(snapshot);
    });
}

/* ==========================================
   WATCH VOICE PARTICIPANTS
   JOIN / LEAVE SOUND DETECTION
========================================== */

function watchParticipants() {
    if (!roomId) return;

    stopParticipants?.();
    stopParticipants = null;

    participants.clear();

    // Reset sound detection when changing voice rooms.
    previousVoiceMembers.clear();
    voiceSnapshotInitialized = false;

    renderParticipants();

    stopParticipants = onSnapshot(
        collection(db, "voiceRooms", roomId, "participants"),

        (snapshot) => {
            const fresh = new Map();

            snapshot.forEach((entry) => {
                const data = entry.data();

                const heartbeatAt = Number(
                    data.heartbeatAt || 0
                );

                if (!data.uid || !data.name) return;

                if (Date.now() - heartbeatAt >= STALE_AFTER_MS) {
                    return;
                }

                fresh.set(data.uid, {
                    uid: data.uid,
                    name: data.name,
                    sessionId: data.sessionId,
                    heartbeatAt,

                    cameraOn: Boolean(data.cameraOn),
                    screenOn: Boolean(data.screenOn)
                });
            });

            const currentVoiceMembers = new Set(fresh.keys());

            // Ignore the first snapshot to prevent false sounds.
            if (voiceSnapshotInitialized) {

                // Detect new members.
                currentVoiceMembers.forEach((uid) => {
                    if (
                        !previousVoiceMembers.has(uid) &&
                        uid !== user?.uid
                    ) {
                        playVoicePresenceSound("join");
                    }
                });

                // Detect members who left.
                previousVoiceMembers.forEach((uid) => {
                    if (
                        !currentVoiceMembers.has(uid) &&
                        uid !== user?.uid
                    ) {
                        playVoicePresenceSound("leave");
                    }
                });
            }

            // Store the current room membership.
            previousVoiceMembers = currentVoiceMembers;
            voiceSnapshotInitialized = true;

            participants.clear();

            fresh.forEach((value, key) => {
                participants.set(key, value);
            });

            renderParticipants();

            // Remove connections for people who left.
            [...peers.keys()].forEach((uid) => {
                if (!participants.has(uid)) {
                    closePeer(uid);
                }
            });

            if (localStream) {
                participants.forEach((person) => {
                    if (person.uid !== user?.uid) {
                        void startOutgoingCall(person);
                    }
                });

                processIncomingCalls();
            }
        },

        (error) => {
            console.error(
                "Voice presence listener failed:",
                error
            );

            setStatus("Could not read voice members.");
        }
    );
}

/* ==========================================
   WATCH INCOMING CALLS
========================================== */

function watchIncomingCalls() {
    if (!roomId || !user) return;

    stopCalls?.();
    stopCalls = null;

    stopCalls = onSnapshot(
        query(
            collection(db, "voiceRooms", roomId, "calls"),
            where("calleeUid", "==", user.uid)
        ),

        (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "removed") {
                    incomingCalls.delete(change.doc.id);

                    const callerUid =
                        change.doc.data()?.callerUid;

                    if (callerUid) {
                        closePeer(callerUid);
                    }

                } else {
                    incomingCalls.set(
                        change.doc.id,
                        change.doc
                    );
                }
            });

            processIncomingCalls();
        },

        (error) => {
            console.error(
                "Voice call listener failed:",
                error
            );

            setStatus(
                "Voice signaling was denied by Firebase."
            );
        }
    );
}

/* ==========================================
   UPDATE PARTICIPANT FLAGS
========================================== */

async function refreshPresenceFlags() {
    if (!roomId || !user || !localStream) return;
    try {
        await setDoc(
            doc(db, "voiceRooms", roomId, "participants", user.uid),
            {
                uid: user.uid,
                name: String(activeVoiceProfile.displayName || user.displayName || "Member").slice(0, 80),
                sessionId,
                heartbeatAt: Date.now(),
                cameraOn,
                screenOn,
                muted,
                deafened,
                raisedHand,
                badges: Array.isArray(activeVoiceProfile.badges) ? activeVoiceProfile.badges.slice(0, 4) : []
            },
            { merge: true }
        );
    } catch (error) {
        console.warn("Presence flags could not be updated:", error);
    }
}

/* ==========================================
   CHANGE CAMERA / SCREEN VIDEO TRACKS
========================================== */

async function replaceVideoTrack(kind, track) {
    const updates = [];

    peers.forEach((peer) => {
        const sender = peer.videoSenders?.[kind];

        if (sender) {
            updates.push(
                sender.replaceTrack(track || null).catch((error) => {
                    console.error(
                        `Could not update ${kind} track:`,
                        error
                    );
                })
            );
        }
    });

    await Promise.all(updates);
}

/* ==========================================
   CAMERA
========================================== */

async function toggleCamera() {
    if (!localStream) return;

    if (cameraOn) {
        cameraOn = false;

        const oldStream = cameraStream;
        cameraStream = null;

        oldStream?.getTracks().forEach((track) => {
            track.stop();
        });

        await replaceVideoTrack("camera", null);

        setPressed(cameraButton, false);
        setButtonLabel(cameraButton, "Camera");

        setStatus("Camera off");

        await refreshPresenceFlags();
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true
        });

        const track = cameraStream.getVideoTracks()[0];

        await replaceVideoTrack("camera", track);

        cameraOn = true;

        setPressed(cameraButton, true);
        setButtonLabel(cameraButton, "Camera on");

        setStatus("Camera on");

        await refreshPresenceFlags();

    } catch (error) {
        console.error("Camera permission failed:", error);

        cameraStream?.getTracks().forEach((track) => {
            track.stop();
        });

        cameraStream = null;
        cameraOn = false;

        setPressed(cameraButton, false);
        setButtonLabel(cameraButton, "Camera");

        setStatus("Camera permission was blocked.");
    }
}

/* ==========================================
   STOP SCREEN SHARING
========================================== */

async function stopScreenShare() {
    if (!screenOn) return;

    screenOn = false;

    const oldStream = screenStream;
    screenStream = null;

    oldStream?.getTracks().forEach((track) => {
        track.stop();
    });

    await replaceVideoTrack("screen", null);

    setPressed(screenButton, false);
    setButtonLabel(screenButton, "Screen");

    setStatus("Screen share stopped");

    await refreshPresenceFlags();
}

/* ==========================================
   SCREEN SHARING
========================================== */

async function toggleScreen() {
    if (!localStream) return;

    if (screenOn) {
        await stopScreenShare();
        return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
        setStatus("Screen sharing is not supported by this browser.");
        return;
    }

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
        });

        const track = screenStream.getVideoTracks()[0];

        if (!track) {
            throw new Error("No screen video track was created.");
        }

        screenOn = true;

        track.onended = () => {
            if (screenOn) {
                void stopScreenShare();
            }
        };

        await replaceVideoTrack("screen", track);

        setPressed(screenButton, true);
        setButtonLabel(screenButton, "Sharing");

        setStatus("Sharing your screen");

        await refreshPresenceFlags();

    } catch (error) {
        console.error("Screen share failed:", error);

        screenStream?.getTracks().forEach((track) => {
            track.stop();
        });

        screenStream = null;
        screenOn = false;

        setPressed(screenButton, false);
        setButtonLabel(screenButton, "Screen");

        setStatus(
            error.name === "NotAllowedError"
                ? "Screen share was cancelled."
                : "Could not start screen sharing."
        );
    }
}

/* ==========================================
   JOIN VOICE
========================================== */

async function joinVoice() {
    if (!user) {
        setStatus("Sign in before joining a voice lounge.");
        return;
    }

    if (!selectedChannel || !roomId) {
        setStatus("Click a voice lounge first.");
        return;
    }

    if (localStream || joining) return;

    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus(
            "Microphone access requires HTTPS and a supported browser."
        );

        return;
    }

    joining = true;

    if (joinButton) {
        joinButton.disabled = true;
    }

    setStatus("Requesting microphone permission...");

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        sessionId =
            globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        muted = false;
        cameraOn = false;
        screenOn = false;

        if (controlsRow) {
            controlsRow.hidden = false;
        }

        if (leaveRow) {
            leaveRow.hidden = false;
        }

        [
            muteButton,
            cameraButton,
            screenButton,
            leaveButton
        ].forEach((button) => {
            if (button) button.disabled = false;
        });

        setPressed(muteButton, false);
        setPressed(cameraButton, false);
        setPressed(screenButton, false);

        setButtonLabel(muteButton, "Mute");
        setButtonLabel(cameraButton, "Camera");
        setButtonLabel(screenButton, "Screen");

        const presenceRef = doc(
            db,
            "voiceRooms",
            roomId,
            "participants",
            user.uid
        );

        const heartbeat = () => {
            return setDoc(presenceRef, {
                uid: user.uid,

                name: (
                    user.displayName || "Member"
                ).slice(0, 80),

                sessionId,
                heartbeatAt: Date.now(),

                cameraOn,
                screenOn
            });
        };

        await heartbeat();

        heartbeatTimer = setInterval(() => {
            if (localStream) {
                heartbeat().catch((error) => {
                    console.warn(
                        "Presence refresh failed:",
                        error
                    );
                });
            }
        }, HEARTBEAT_MS);

        watchIncomingCalls();

        setStatus(`Connected to ${selectedChannel}`);

    } catch (error) {
        console.error("Unable to join voice:", error);

        localStream?.getTracks().forEach((track) => {
            track.stop();
        });

        localStream = null;

        [
            muteButton,
            cameraButton,
            screenButton,
            leaveButton
        ].forEach((button) => {
            if (button) button.disabled = true;
        });

        if (controlsRow) controlsRow.hidden = true;
        if (leaveRow) leaveRow.hidden = true;

        setStatus(
            error.name === "NotAllowedError"
                ? "Microphone permission was blocked."
                : "Could not join voice. Check microphone access and Firebase rules."
        );

    } finally {
        joining = false;

        if (joinButton) {
            joinButton.disabled = false;
        }
    }
}

/* ==========================================
   LEAVE VOICE
========================================== */

async function leaveVoice(knownUid = user?.uid) {
    const oldRoom = roomId;
    const oldUid = knownUid;

    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
    }

    heartbeatTimer = null;

    stopCalls?.();
    stopCalls = null;

    stopParticipants?.();
    stopParticipants = null;

    localStream?.getTracks().forEach((track) => {
        track.stop();
    });

    cameraStream?.getTracks().forEach((track) => {
        track.stop();
    });

    screenStream?.getTracks().forEach((track) => {
        track.stop();
    });

    localStream = null;
    cameraStream = null;
    screenStream = null;

    closeAllPeers();

    incomingCalls.clear();
    participants.clear();

    previousVoiceMembers.clear();
    voiceSnapshotInitialized = false;

    videoGrid?.replaceChildren();
    audioContainer?.replaceChildren();
    remoteScreenContainer?.replaceChildren();

    muted = false;
    cameraOn = false;
    screenOn = false;

    [
        muteButton,
        cameraButton,
        screenButton,
        leaveButton
    ].forEach((button) => {
        if (button) button.disabled = true;
    });

    if (controlsRow) {
        controlsRow.hidden = true;
    }

    if (leaveRow) {
        leaveRow.hidden = true;
    }

    setButtonLabel(muteButton, "Mute");
    setButtonLabel(cameraButton, "Camera");
    setButtonLabel(screenButton, "Screen");

    setPressed(muteButton, false);
    setPressed(cameraButton, false);
    setPressed(screenButton, false);

    renderParticipants();

    await Promise.allSettled(
        [...outgoingCalls.values()].map((callRef) => {
            return deleteDoc(callRef);
        })
    );

    outgoingCalls.clear();

    if (oldRoom && oldUid) {
        try {
            await deleteDoc(
                doc(
                    db,
                    "voiceRooms",
                    oldRoom,
                    "participants",
                    oldUid
                )
            );

        } catch (error) {
            console.warn(
                "Presence will expire after heartbeat timeout:",
                error
            );
        }
    }

    setStatus(
        selectedChannel
            ? `Left ${selectedChannel}`
            : "Not connected"
    );
}

/* ==========================================
   MUTE / UNMUTE
========================================== */

function toggleMute() {
    if (!localStream) return;

    muted = !muted;

    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
    });

    setButtonLabel(
        muteButton,
        muted ? "Unmute" : "Mute"
    );

    setPressed(muteButton, muted);

    setStatus(
        `${muted ? "Muted in" : "Connected to"} ${selectedChannel}`
    );
}

/* ==========================================
   VOICE CHANNEL SELECTION
   AUTO JOIN
========================================== */

channelItems.forEach((channel) => {
    channel.addEventListener("click", async (event) => {
        if (event.target.closest("#voicePanel")) {
            return;
        }

        const nextName =
            channel.dataset.voiceName ||
            channel.textContent.trim();

        const nextRoom = makeRoomId(nextName);

        // Already connected to this channel.
        if (localStream && nextRoom === roomId) {
            return;
        }

        // Leave the previous channel first.
        if (localStream && nextRoom !== roomId) {
            await leaveVoice();
        }

        // Update active channel.
        channelItems.forEach((item) => {
            const active = item === channel;

            item.classList.toggle("active", active);

            item.setAttribute(
                "aria-expanded",
                String(active)
            );
        });

        // Hide old Join buttons.
        joinSlots.forEach((slot) => {
            slot.hidden = true;
        });

        selectedChannel = nextName;
        roomId = nextRoom;

        // Move the voice panel into the selected row.
        const ownRow = channel.closest(".voice-row");

        if (
            panel &&
            ownRow &&
            panel.parentElement !== ownRow
        ) {
            ownRow.appendChild(panel);
        }

        if (panel) {
            panel.hidden = false;
        }

        // Watch the selected room.
        watchParticipants();

        // Automatically connect.
        await joinVoice();
    });
});

/* ==========================================
   VOICE BUTTON EVENTS
========================================== */

leaveButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    void leaveVoice();
});

muteButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMute();
});

cameraButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleCamera();
});

screenButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleScreen();
});

/* ==========================================
   AUTHENTICATION
========================================== */

onAuthStateChanged(auth, (nextUser) => {
    const previousUser = user;

    user = nextUser;

    if (!nextUser) {
        stopCounts.forEach((stop) => stop());
        stopCounts.clear();

        if (localStream) {
            void leaveVoice(previousUser?.uid);
        }

        return;
    }

    // If the account changes, leave the old voice session.
    if (
        previousUser &&
        previousUser.uid !== nextUser.uid &&
        localStream
    ) {
        void leaveVoice(previousUser.uid);
    }

    watchChannelCounts();

    if (selectedChannel) {
        watchParticipants();
    }
});

/* ==========================================
   GLOBAL LEAVE FUNCTION
========================================== */

window.leaveVoiceChat = leaveVoice;

/* ==========================================
   PAGE CLEANUP
========================================== */

window.addEventListener("pagehide", () => {
    stopCounts.forEach((stop) => stop());
    stopCounts.clear();

    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
    }

    localStream?.getTracks().forEach((track) => {
        track.stop();
    });

    cameraStream?.getTracks().forEach((track) => {
        track.stop();
    });

    screenStream?.getTracks().forEach((track) => {
        track.stop();
    });

    closeAllPeers();
});

// ==================================================
// DIAMOND LOUNGE — VOICE JOIN / LEAVE SOUND ENGINE
// ==================================================

let voiceSoundAudioContext = null;

function playVoicePresenceSound(type) {
    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return;

        voiceSoundAudioContext ??= new AudioContextClass();

        if (voiceSoundAudioContext.state === "suspended") {
            voiceSoundAudioContext.resume();
        }

        const ctx = voiceSoundAudioContext;
        const now = ctx.currentTime;

        const notes = type === "join"
            ? [660, 880]
            : [880, 660];

        notes.forEach((frequency, index) => {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            gain.gain.setValueAtTime(0, now + index * 0.12);
            gain.gain.linearRampToValueAtTime(
                0.12,
                now + index * 0.12 + 0.025
            );
            gain.gain.exponentialRampToValueAtTime(
                0.001,
                now + index * 0.12 + 0.18
            );

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.start(now + index * 0.12);
            oscillator.stop(now + index * 0.12 + 0.2);
        });

    } catch (error) {
        console.warn("Voice presence sound failed:", error);
    }
}
/* CREATED-SERVER VOICE BRIDGE */
window.diamondJoinCreatedVoiceRoom=async(label,customRoomId)=>{if(localStream)await leaveVoice();selectedChannel=label;roomId=customRoomId;setStatus("Connecting to "+label+"...");watchParticipants();await joinVoice();};
window.diamondLeaveVoice=()=>leaveVoice();
window.diamondWatchCreatedVoiceRoom = (customRoomId, stage, audience) => {
    const profileCache = new Map();
    const avatarPresets = {
        diamond: {
            background: "linear-gradient(145deg,#2b2924,#141416)",
            color: "#e1c98f",
            glyph: "✦"
        },
        gold: {
            background: "linear-gradient(145deg,#c7a96b,#8b7040)",
            color: "#1a1610",
            glyph: "G"
        },
        silver: {
            background: "linear-gradient(145deg,#c9ccd2,#8d9198)",
            color: "#191a1d",
            glyph: "S"
        },
        emerald: {
            background: "linear-gradient(145deg,#4f8a63,#2c5740)",
            color: "#eef7f0",
            glyph: "E"
        },
        ruby: {
            background: "linear-gradient(145deg,#a5535a,#6f2f36)",
            color: "#fbeeee",
            glyph: "R"
        },
        royal: {
            background: "linear-gradient(145deg,#5a5fa5,#33376f)",
            color: "#eeeffb",
            glyph: "V"
        }
    };

    const unsubscribe = onSnapshot(
        collection(db, "voiceRooms", customRoomId, "participants"),
        snapshot => {
            const liveMembers = snapshot.docs
                .map(entry => entry.data())
                .filter(member =>
                    Date.now() - Number(member.heartbeatAt || 0) < STALE_AFTER_MS
                );

            stage.replaceChildren();
            audience.replaceChildren();

            if (!liveMembers.length) {
                stage.textContent = "No one connected yet.";
                return;
            }

            liveMembers.forEach(member => {
                const displayName = member.name || "Member";
                const tile = document.createElement("div");
                tile.className = "created-server-voice-tile";

                const avatar = document.createElement("div");
                avatar.className = "created-server-voice-avatar";
                avatar.textContent = displayName.trim().slice(0, 1).toUpperCase();

                const name = document.createElement("div");
                name.className = "created-server-voice-name";
                name.textContent = displayName;
                tile.append(avatar, name);

                if (member.cameraOn || member.screenOn) {
                    const mediaBadge = document.createElement("span");
                    mediaBadge.textContent = member.cameraOn ? "📷" : "🖥️";
                    tile.append(mediaBadge);
                }

                stage.append(tile);

                const audienceMember = document.createElement("div");
                audienceMember.className = "created-server-audience-member";
                audienceMember.textContent = displayName;
                audience.append(audienceMember);

                if (!member.uid) return;

                let profilePromise = profileCache.get(member.uid);
                if (!profilePromise) {
                    profilePromise = getDoc(doc(db, "users", member.uid))
                        .then(profile => profile.exists() ? profile.data() : {})
                        .catch(error => {
                            console.warn("Voice avatar profile unavailable:", error);
                            return {};
                        });
                    profileCache.set(member.uid, profilePromise);
                }

                profilePromise.then(profile => {
                    if (!avatar.isConnected) return;

                    if (typeof profile.picture === "string" && profile.picture) {
                        avatar.replaceChildren();
                        const image = document.createElement("img");
                        image.src = profile.picture;
                        image.alt = displayName + " avatar";
                        image.className = "created-server-voice-avatar-image";
                        avatar.append(image);
                        return;
                    }

                    const preset = avatarPresets[profile.avatar] || avatarPresets.diamond;
                    avatar.textContent = preset.glyph;
                    avatar.style.background = preset.background;
                    avatar.style.color = preset.color;
                });
            });
        },
        error => {
            console.error("Created-server voice presence failed:", error);
            stage.textContent = "Voice members could not be loaded.";
            audience.replaceChildren();
        }
    );

    return () => unsubscribe();
};

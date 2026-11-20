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
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
        urls: "turn:global.relay.metered.ca:80",
        username: "aa74c4572f5063c393acfe40",
        credential: "NzdXtF8nNR6Nl6Uf"
    },
    {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "aa74c4572f5063c393acfe40",
        credential: "NzdXtF8nNR6Nl6Uf"
    },
    {
        urls: "turn:global.relay.metered.ca:443",
        username: "aa74c4572f5063c393acfe40",
        credential: "NzdXtF8nNR6Nl6Uf"
    },
    {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "aa74c4572f5063c393acfe40",
        credential: "NzdXtF8nNR6Nl6Uf"
    }
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
let activeVoiceServerName = "";

const participants = new Map();
const peers = new Map();
const activeRemoteScreenUids = new Set();
const outgoingCalls = new Map();
const incomingCalls = new Map();
const stopCounts = new Map();
const voiceSidebarProfileCache = new Map();

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
        serverName: activeVoiceServerName,
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

function renderVoiceRowMiniMembers(row, members) {
    if (!row) return;
    let strip = row.querySelector(".voice-row-member-avatars");
    const live = members.slice(0, 4);
    if (!live.length) {
        strip?.remove();
        row.classList.remove("has-voice-members");
        return;
    }
    if (!strip) {
        strip = document.createElement("div");
        strip.className = "voice-row-member-avatars";
        const head = row.querySelector(".voice-row-head");
        if (head) head.insertAdjacentElement("afterend", strip);
        else row.append(strip);
    }
    strip.replaceChildren();
    row.classList.add("has-voice-members");
    live.forEach(person => {
        const avatar = document.createElement("span");
        avatar.className = "voice-row-member-avatar";
        avatar.textContent = String(person.name || "M").trim().slice(0, 1).toUpperCase();
        avatar.title = person.name || "Member";
        strip.append(avatar);
        let profilePromise = voiceSidebarProfileCache.get(person.uid);
        if (!profilePromise) {
            profilePromise = getDoc(doc(db, "users", person.uid))
                .then(snapshot => snapshot.exists() ? snapshot.data() : {})
                .catch(() => ({}));
            voiceSidebarProfileCache.set(person.uid, profilePromise);
        }
        profilePromise.then(profile => {
            if (!avatar.isConnected) return;
            if (typeof profile.picture === "string" && profile.picture) {
                avatar.replaceChildren();
                const image = document.createElement("img");
                image.src = profile.picture;
                image.alt = "";
                avatar.append(image);
            } else {
                const colors = {
                    gold: ["#c7a96b", "#1a1610", "G"],
                    silver: ["#c9ccd2", "#191a1d", "S"],
                    emerald: ["#4f8a63", "#eef7f0", "E"],
                    ruby: ["#a5535a", "#fbeeee", "R"],
                    royal: ["#5a5fa5", "#eeeffb", "V"],
                    diamond: ["#2b2924", "#e1c98f", "✦"]
                };
                const preset = colors[profile.avatar] || colors.diamond;
                avatar.style.background = preset[0];
                avatar.style.color = preset[1];
                avatar.textContent = preset[2];
            }
        });
    });
    if (members.length > live.length) {
        const extra = document.createElement("span");
        extra.className = "voice-row-member-extra";
        extra.textContent = "+" + (members.length - live.length);
        strip.append(extra);
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

                const liveMembers = snapshot.docs
                    .map(entry => entry.data())
                    .filter(member =>
                        member.uid &&
                        Date.now() - Number(member.heartbeatAt || 0) < STALE_AFTER_MS
                    )
                    .sort((a, b) => Number(a.heartbeatAt || 0) - Number(b.heartbeatAt || 0));

                element.textContent =
                    live === 0
                        ? "No one in voice"
                        : live === 1
                            ? "1 in voice"
                            : `${live} in voice`;

                element.classList.toggle("has-people", live > 0);
                renderVoiceRowMiniMembers(element.closest(".voice-row"), liveMembers);
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

function refreshScreenShareStageVisibility() {
    const active = Boolean(screenOn || activeRemoteScreenUids.size);
    if (screenShareStage) screenShareStage.hidden = !active;
    window.dispatchEvent(new CustomEvent("diamond-screen-share-layout", {
        detail: { active, local: screenOn, remoteCount: activeRemoteScreenUids.size }
    }));
}

function syncLocalScreenPreview() {
    if (!remoteScreenContainer) return;
    let tile = document.getElementById("local-screen-share-preview");

    if (!screenOn || !screenStream) {
        tile?.remove();
        refreshScreenShareStageVisibility();
        return;
    }

    if (!tile) {
        tile = document.createElement("figure");
        tile.id = "local-screen-share-preview";
        tile.className = "remote-video-tile remote-video-screen created-server-local-screen";

        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.objectFit = "contain";

        const caption = document.createElement("figcaption");
        caption.textContent = "Your screen";
        tile.append(video, caption);
        remoteScreenContainer.append(tile);
    }

    const video = tile.querySelector("video");
    if (video && video.srcObject !== screenStream) {
        video.srcObject = screenStream;
        video.play().catch(error => console.warn("Local screen preview playback failed:", error));
    }
    refreshScreenShareStageVisibility();
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
    activeRemoteScreenUids.delete(uid);
    refreshScreenShareStageVisibility();

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
            const remoteVideo = tile?.querySelector("video");
            // attachRemoteVideo assigns srcObject and initiates playback once.
            // Avoid a second srcObject load which interrupts play() with AbortError.
            if (remoteVideo) {
                remoteVideo.autoplay = true;
                remoteVideo.playsInline = true;
                remoteVideo.muted = true;
            }
            if (tile) tile.hidden = event.track.muted;

            event.track.onunmute = () => {
                if (tile) tile.hidden = false;
                if (remoteVideo) remoteVideo.play().catch(error => console.warn("Remote video playback retry failed:", error));
                if (kind === "camera") tile?.parentElement?.classList.add("has-camera");
                if (kind === "screen") {
                    activeRemoteScreenUids.add(person.uid);
                    refreshScreenShareStageVisibility();
                }
            };

            event.track.onmute = () => {
                if (tile) tile.hidden = true;
                if (kind === "camera" && !tile?.parentElement?.querySelector("#local-voice-camera-preview")) {
                    tile?.parentElement?.classList.remove("has-camera");
                }
                if (kind === "screen") {
                    activeRemoteScreenUids.delete(person.uid);
                    refreshScreenShareStageVisibility();
                }
            };

            event.track.onended = () => {
                if (kind === "screen") {
                    activeRemoteScreenUids.delete(person.uid);
                    refreshScreenShareStageVisibility();
                }
            };

            if (!event.track.muted && tile) {
                tile.hidden = false;
                if (kind === "camera") tile.parentElement?.classList.add("has-camera");
                if (kind === "screen") {
                    activeRemoteScreenUids.add(person.uid);
                    refreshScreenShareStageVisibility();
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

    pc.oniceconnectionstatechange = () => {
        console.info("[Diamond Lounge] ICE state:", person.name, pc.iceConnectionState);
    };
    pc.onicegatheringstatechange = () => {
        console.info("[Diamond Lounge] ICE gathering:", person.name, pc.iceGatheringState);
    };
    pc.onconnectionstatechange = () => {
        console.info("[Diamond Lounge] Peer connection state:", person.name, pc.connectionState);
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
        syncLocalVoiceCameraPreview();

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
        syncLocalVoiceCameraPreview();

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
    syncLocalScreenPreview();

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
        syncLocalScreenPreview();

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
        syncLocalScreenPreview();

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
        deafened = false;
        raisedHand = false;
        activeVoiceProfile = {};
        activeRemoteScreenUids.clear();
        syncLocalScreenPreview();
        try {
            const profileSnapshot = await getDoc(doc(db, "users", user.uid));
            activeVoiceProfile = profileSnapshot.exists() ? profileSnapshot.data() : {};
        } catch (profileError) {
            console.warn("Voice profile could not be loaded:", profileError);
        }

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

                name: String(activeVoiceProfile.displayName || user.displayName || "Member").slice(0, 80),

                sessionId,
                heartbeatAt: Date.now(),

                cameraOn,
                screenOn,
                muted,
                deafened,
                raisedHand,
                badges: Array.isArray(activeVoiceProfile.badges) ? activeVoiceProfile.badges.slice(0, 4) : []
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
        publishVoiceUiState();
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
    deafened = false;
    raisedHand = false;
    activeVoiceProfile = {};
    activeVoiceServerName = "";
    activeRemoteScreenUids.clear();
    syncLocalVoiceCameraPreview();
    syncLocalScreenPreview();

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
    void refreshPresenceFlags();
}

function toggleDeafen() {
    if (!localStream) return;
    deafened = !deafened;
    peers.forEach(peer => {
        if (peer.audio) peer.audio.muted = deafened;
    });
    audioContainer?.querySelectorAll("audio").forEach(audio => {
        audio.muted = deafened;
    });
    setStatus(deafened ? "Audio muted for you" : "Voice connected to " + selectedChannel);
    void refreshPresenceFlags();
}

function toggleRaiseHand() {
    if (!localStream) return;
    raisedHand = !raisedHand;
    setStatus(raisedHand ? "You raised your hand" : "You lowered your hand");
    void refreshPresenceFlags();
}

function setOutputVolume(value) {
    outputVolume = Math.max(0, Math.min(1, Number(value) || 0));
    peers.forEach(peer => {
        if (peer.audio) peer.audio.volume = outputVolume;
    });
    audioContainer?.querySelectorAll("audio").forEach(audio => {
        audio.volume = outputVolume;
    });
    publishVoiceUiState();
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

        // Already connected: reopen the call screen without reconnecting.
        if (localStream && nextRoom === roomId) {
            activeVoiceServerName = "VIP-LOUNGE";
            window.diamondOpenPrimaryVoiceCall?.(nextName, nextRoom);
            watchParticipants();
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
        activeVoiceServerName = "VIP-LOUNGE";
        window.diamondOpenPrimaryVoiceCall?.(nextName, nextRoom);

        // Keep the old inline control panel out of the Discord-style voice layout. 
        const ownRow = channel.closest(".voice-row");

        if (
            panel &&
            ownRow &&
            panel.parentElement !== ownRow
        ) {
            ownRow.appendChild(panel);
        }

        if (panel) {
            panel.hidden = true;
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
window.diamondVoiceControls = {
    getState: () => ({
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
        serverName: activeVoiceServerName,
        outputVolume
    }),
    toggleMute,
    toggleCamera,
    toggleScreen,
    toggleDeafen,
    toggleRaiseHand,
    refreshProfile: async () => {
        if (!user) return;
        try {
            const snapshot = await getDoc(doc(db, "users", user.uid));
            activeVoiceProfile = snapshot.exists() ? snapshot.data() : {};
            await refreshPresenceFlags();
        } catch (error) {
            console.warn("Live voice profile refresh failed:", error);
        }
    },
    leave: () => leaveVoice(),
    setOutputVolume
};

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
function getVoiceSoundContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    voiceSoundAudioContext ??= new AudioContextClass();
    return voiceSoundAudioContext;
}
function resumeVoiceSoundFromGesture() {
    const ctx = getVoiceSoundContext();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}
document.addEventListener("pointerdown", resumeVoiceSoundFromGesture);
document.addEventListener("keydown", resumeVoiceSoundFromGesture);
import { playVoicePresenceSound } from "./voice-sounds.js?v=1";

window.diamondTestVoicePresenceSound = (type = 'join') => playVoicePresenceSound(type);
window.diamondWatchCreatedVoiceSidebarRoom = (customRoomId, strip) => {
    const profileCache = new Map();
    const unsubscribe = onSnapshot(
        collection(db, "voiceRooms", customRoomId, "participants"),
        snapshot => {
            const members = snapshot.docs
                .map(entry => entry.data())
                .filter(member =>
                    member.uid &&
                    Date.now() - Number(member.heartbeatAt || 0) < STALE_AFTER_MS
                )
                .sort((a, b) => Number(a.heartbeatAt || 0) - Number(b.heartbeatAt || 0));

            strip.replaceChildren();
            if (!members.length) {
                strip.hidden = true;
                return;
            }
            strip.hidden = false;

            members.slice(0, 4).forEach(member => {
                const avatar = document.createElement("span");
                avatar.className = "created-server-voice-sidebar-member";
                avatar.textContent = String(member.name || "M").trim().slice(0, 1).toUpperCase();
                avatar.title = member.name || "Member";
                strip.append(avatar);

                let promise = profileCache.get(member.uid);
                if (!promise) {
                    promise = getDoc(doc(db, "users", member.uid))
                        .then(profile => profile.exists() ? profile.data() : {})
                        .catch(() => ({}));
                    profileCache.set(member.uid, promise);
                }
                promise.then(profile => {
                    if (!avatar.isConnected) return;
                    if (typeof profile.picture === "string" && profile.picture) {
                        avatar.replaceChildren();
                        const image = document.createElement("img");
                        image.src = profile.picture;
                        image.alt = "";
                        avatar.append(image);
                    } else {
                        const styles = {
                            diamond: ["#2b2924", "#e1c98f", "✦"],
                            gold: ["#c7a96b", "#1a1610", "G"],
                            silver: ["#c9ccd2", "#191a1d", "S"],
                            emerald: ["#4f8a63", "#eef7f0", "E"],
                            ruby: ["#a5535a", "#fbeeee", "R"],
                            royal: ["#5a5fa5", "#eeeffb", "V"]
                        };
                        const style = styles[profile.avatar] || styles.diamond;
                        avatar.style.background = style[0];
                        avatar.style.color = style[1];
                        avatar.textContent = style[2];
                    }
                });
            });

            if (members.length > 4) {
                const extra = document.createElement("span");
                extra.className = "voice-row-member-extra";
                extra.textContent = "+" + (members.length - 4);
                strip.append(extra);
            }
        },
        error => {
            console.warn("Voice sidebar member listener failed:", error);
            strip.replaceChildren();
            strip.hidden = true;
        }
    );
    return () => unsubscribe();
};

/* CREATED-SERVER VOICE BRIDGE */
window.diamondJoinCreatedVoiceRoom = async (label, customRoomId, serverName = "") => {
    if (!customRoomId || !label) return;

    // Reopening the currently connected voice channel should not drop/rejoin.
    if (localStream && roomId === customRoomId) {
        selectedChannel = label;
        activeVoiceServerName = serverName || "";
        setStatus("Connected to " + label);
        watchParticipants();
        return;
    }

    // Moving between voice channels is seamless: leave the old room, then
    // immediately start connecting to the newly selected room.
    if (localStream) await leaveVoice();

    selectedChannel = label;
    roomId = customRoomId;
    activeVoiceServerName = serverName || "";
    setStatus("Connecting to " + label + "...");
    watchParticipants();
    await joinVoice();
};
window.diamondLeaveVoice=()=>leaveVoice();
window.diamondWatchCreatedVoiceRoom = (customRoomId, stage, audience, context = {}) => {
    const profileCache = new Map();
    const roleCache = new Map();
    const tileCache = new Map();
    const tileRoots = new Map();
    const cardColors = ["#26343f", "#17191d", "#dfc5ad", "#4b74b6", "#3a3544", "#315044"];
    let previousMemberIds = new Set();
    let initializedMembershipSounds = false;

    const avatarPresets = {
        diamond: { background: "linear-gradient(145deg,#2b2924,#141416)", color: "#e1c98f", glyph: "✦", tile: "#26343f" },
        gold: { background: "linear-gradient(145deg,#c7a96b,#8b7040)", color: "#1a1610", glyph: "G", tile: "#dfc5ad" },
        silver: { background: "linear-gradient(145deg,#c9ccd2,#8d9198)", color: "#191a1d", glyph: "S", tile: "#30343b" },
        emerald: { background: "linear-gradient(145deg,#4f8a63,#2c5740)", color: "#eef7f0", glyph: "E", tile: "#315044" },
        ruby: { background: "linear-gradient(145deg,#a5535a,#6f2f36)", color: "#fbeeee", glyph: "R", tile: "#55373e" },
        royal: { background: "linear-gradient(145deg,#5a5fa5,#33376f)", color: "#eeeffb", glyph: "V", tile: "#4b74b6" }
    };

    window.diamondVoiceTileRoots = tileRoots;

    function makeTile(member) {
        const tile = document.createElement("article");
        tile.className = "created-server-voice-tile";
        tile.dataset.uid = member.uid;

        const avatar = document.createElement("div");
        avatar.className = "created-server-voice-avatar";
        avatar.textContent = String(member.name || "Member").trim().slice(0, 1).toUpperCase();

        const footer = document.createElement("div");
        footer.className = "created-server-voice-tile-footer";

        const identity = document.createElement("div");
        identity.className = "created-server-voice-identity";

        const name = document.createElement("span");
        name.className = "created-server-voice-name-pill";
        name.textContent = member.name || "Member";

        const badges = document.createElement("div");
        badges.className = "created-server-voice-badges";

        identity.append(name, badges);

        const indicators = document.createElement("div");
        indicators.className = "created-server-voice-indicators";

        footer.append(identity, indicators);
        tile.append(avatar, footer);

        if (member.uid === user?.uid) tile.classList.add("is-self");
        tileCache.set(member.uid, { tile, avatar, name, badges, indicators });
        tileRoots.set(member.uid, tile);
        return tile;
    }

    function renderProfile(member, profile) {
        const parts = tileCache.get(member.uid);
        if (!parts || !parts.tile.isConnected) return;

        const name = profile.displayName || member.name || "Member";
        parts.name.textContent = name;

        const preset = avatarPresets[profile.avatar] || avatarPresets.diamond;
        const picture = typeof profile.picture === "string" ? profile.picture : "";
        const uidText = String(member.uid || name);
        const uidHash = [...uidText].reduce((value, character) => value + character.charCodeAt(0), 0);
        const fallbackTone = cardColors[uidHash % cardColors.length];

        parts.tile.style.setProperty(
            "--voice-card-background",
            profile.avatar && profile.avatar !== "diamond" ? preset.tile : fallbackTone
        );
        parts.avatar.replaceChildren();

        if (picture) {
            const image = document.createElement("img");
            image.src = picture;
            image.alt = name + " avatar";
            image.className = "created-server-voice-avatar-image";
            parts.avatar.append(image);
        } else {
            parts.avatar.textContent = preset.glyph;
            parts.avatar.style.background = preset.background;
            parts.avatar.style.color = preset.color;
        }

        parts.badges.replaceChildren();
        const labels = Array.isArray(member.badges)
            ? member.badges
            : (Array.isArray(profile.badges) ? profile.badges : []);
        labels.slice(0, 4).forEach(label => {
            const badge = document.createElement("span");
            badge.className = "created-server-voice-badge";
            badge.textContent = String(label).trim().slice(0, 24);
            if (badge.textContent) parts.badges.append(badge);
        });

        if (context.serverId && member.uid) {
            let rolePromise = roleCache.get(member.uid);
            if (!rolePromise) {
                rolePromise = getDoc(doc(db, "servers", context.serverId, "members", member.uid))
                    .then(snapshot => snapshot.exists() ? snapshot.data() : {})
                    .catch(() => ({}));
                roleCache.set(member.uid, rolePromise);
            }
            rolePromise.then(memberRecord => {
                if (!parts.tile.isConnected) return;
                const roleIds = Array.isArray(memberRecord.roleIds) ? memberRecord.roleIds : [];
                const roleLabel = roleIds.includes("owner") ? "Owner" : roleIds.includes("admin") ? "Admin" : "";
                parts.badges.querySelector('[data-server-role="true"]')?.remove();
                if (roleLabel) {
                    const roleBadge = document.createElement("span");
                    roleBadge.className = "created-server-voice-badge is-role";
                    roleBadge.dataset.serverRole = "true";
                    roleBadge.textContent = roleLabel;
                    parts.badges.prepend(roleBadge);
                }
            });
        }
    }

    function updateTile(member) {
        let parts = tileCache.get(member.uid);
        if (!parts) {
            makeTile(member);
            parts = tileCache.get(member.uid);
        }

        parts.name.textContent = member.name || "Member";
        parts.tile.classList.toggle("is-self", member.uid === user?.uid);
        parts.tile.classList.toggle("is-muted", Boolean(member.muted));
        parts.tile.classList.toggle("has-raised-hand", Boolean(member.raisedHand));

        parts.indicators.replaceChildren();
        if (member.muted) {
            const icon = document.createElement("span");
            icon.className = "created-server-voice-indicator is-muted";
            icon.textContent = "⊘";
            icon.title = "Muted";
            parts.indicators.append(icon);
        }
        if (member.cameraOn) {
            const icon = document.createElement("span");
            icon.className = "created-server-voice-indicator";
            icon.textContent = "▣";
            icon.title = "Camera on";
            parts.indicators.append(icon);
        }
        if (member.screenOn) {
            const icon = document.createElement("span");
            icon.className = "created-server-voice-indicator";
            icon.textContent = "▤";
            icon.title = "Sharing screen";
            parts.indicators.append(icon);
        }
        if (member.raisedHand) {
            const hand = document.createElement("span");
            hand.className = "created-server-voice-hand";
            hand.textContent = "✋";
            hand.title = "Raised hand";
            parts.indicators.append(hand);
        }

        stage.append(parts.tile);
        const earlyCamera = document.getElementById("tile-camera-" + member.uid);
        if (earlyCamera && earlyCamera.parentElement !== parts.tile) {
            parts.tile.append(earlyCamera);
            parts.tile.classList.add("has-camera");
        }
        if (member.uid === user?.uid && cameraOn && cameraStream) {
            syncLocalVoiceCameraPreview();
        }

        let promise = profileCache.get(member.uid);
        if (!promise) {
            promise = getDoc(doc(db, "users", member.uid))
                .then(snapshot => snapshot.exists() ? snapshot.data() : {})
                .catch(error => {
                    console.warn("Voice profile unavailable:", error);
                    return {};
                });
            profileCache.set(member.uid, promise);
        }
        promise.then(profile => renderProfile(member, profile));
    }

    const unsubscribe = onSnapshot(
        collection(db, "voiceRooms", customRoomId, "participants"),
        snapshot => {
            const liveMembers = snapshot.docs
                .map(entry => entry.data())
                .filter(member =>
                    member.uid &&
                    Date.now() - Number(member.heartbeatAt || 0) < STALE_AFTER_MS
                );

            const activeIds = new Set(liveMembers.map(member => member.uid));
            if (initializedMembershipSounds) {
                activeIds.forEach(uid => { if (!previousMemberIds.has(uid) && uid !== user?.uid) playVoicePresenceSound("join"); });
                previousMemberIds.forEach(uid => { if (!activeIds.has(uid) && uid !== user?.uid) playVoicePresenceSound("leave"); });
            }
            previousMemberIds = activeIds;
            initializedMembershipSounds = true;
            [...tileCache.keys()].forEach(uid => {
                if (!activeIds.has(uid)) {
                    tileCache.get(uid)?.tile.remove();
                    tileCache.delete(uid);
                    tileRoots.delete(uid);
                }
            });

            if (audience) audience.replaceChildren();
            stage.querySelector(".created-server-voice-empty")?.remove();
            if (liveMembers.length === 1) {
                const waiting = document.createElement("div");
                waiting.className = "created-server-voice-empty";
                waiting.textContent = "Waiting for people to join…";
                stage.prepend(waiting);
            }

            liveMembers.forEach(member => updateTile(member));
            if (audience) audience.hidden = true;
        },
        error => {
            console.error("Created-server voice presence failed:", error);
            stage.replaceChildren();
            const message = document.createElement("div");
            message.className = "created-server-voice-empty";
            message.textContent = "Voice members could not be loaded.";
            stage.append(message);
            if (audience) audience.replaceChildren();
        }
    );

    return () => {
        unsubscribe();
        tileCache.forEach(parts => parts.tile.remove());
        tileCache.clear();
        tileRoots.clear();
        if (window.diamondVoiceTileRoots === tileRoots) {
            window.diamondVoiceTileRoots = new Map();
        }
    };
};

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "[gstatic.com](https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js)";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where
} from "[gstatic.com](https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js)";

const HEARTBEAT_MS = 10000;
const STALE_AFTER_MS = 35000;

const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" }
];

const panel = document.getElementById("voicePanel");
const channelItems = [...document.querySelectorAll(".voice-channel")];
const joinButton = document.getElementById("voiceToggleBtn");
const textButton = document.getElementById("voiceTextBtn");
const muteButton = document.getElementById("muteToggleBtn");
const statusElement = document.getElementById("voiceStatus");
const participantsElement = document.getElementById("voiceParticipants");
const countElement = document.getElementById("voiceParticipantCount");
const audioContainer = document.getElementById("remoteAudioContainer");

let user = null;
let selectedChannel = null;
let roomId = null;
let sessionId = null;
let localStream = null;
let heartbeatTimer = null;
let stopParticipants = null;
let stopCalls = null;
let muted = false;

const participants = new Map();
const peers = new Map();
const outgoingCalls = new Map();
const incomingCalls = new Map();

function setStatus(text) {
    if (statusElement) statusElement.textContent = text;
}

function makeRoomId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function renderParticipants() {
    if (!participantsElement) return;

    const online = [...participants.values()]
        .filter((person) => Date.now() - person.heartbeatAt < STALE_AFTER_MS)
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

        item.append(dot, label);
        participantsElement.appendChild(item);
    });
}

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

function makePeer(person, callRef) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const peer = {
        pc,
        callRef,
        audio: null,
        unsubCall: null,
        unsubCandidates: null,
        candidateIds: new Set(),
        waitingCandidates: []
    };

    peers.set(person.uid, peer);

    localStream?.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        if (!peer.audio) {
            peer.audio = document.createElement("audio");
            peer.audio.autoplay = true;
            peer.audio.playsInline = true;
            peer.audio.dataset.peer = person.uid;
            audioContainer?.appendChild(peer.audio);
        }

        peer.audio.srcObject = event.streams[0];

        peer.audio.play().catch(() => {
            setStatus(
                "Voice connected. Click once on the page if the browser blocks audio."
            );
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
            setStatus("Voice signaling was denied by Firebase.");
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
            setStatus(
                "Voice connection failed. This network may require a TURN server."
            );
        }

        if (["failed", "closed"].includes(pc.connectionState)) {
            closePeer(person.uid);
        }
    };

    peer.unsubCandidates = onSnapshot(
        collection(callRef, "candidates"),
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
        (error) => {
            console.error("Candidate listener failed:", error);
            setStatus("Voice signaling was denied by Firebase.");
        }
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
    if (
        !user ||
        !localStream ||
        !roomId ||
        peers.has(person.uid) ||
        person.uid === user.uid ||
        user.uid.localeCompare(person.uid) > 0
    ) {
        return;
    }

    const callRef = doc(
        collection(doc(db, "voiceRooms", roomId), "calls")
    );

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
                        console.error("Could not apply answer:", error);
                        closePeer(person.uid);
                    }
                }
            },
            (error) => {
                console.error("Call answer listener failed:", error);
            }
        );
    } catch (error) {
        console.error("Could not start voice call:", error);
        closePeer(person.uid);
        setStatus("Could not start voice. Check Firebase rules.");
    }
}

async function answerIncomingCall(callSnapshot) {
    const data = callSnapshot.data();
    const caller = participants.get(data.callerUid);

    if (
        !localStream ||
        !caller ||
        caller.sessionId !== data.callerSessionId ||
        data.calleeSessionId !== sessionId ||
        !data.offer ||
        peers.has(data.callerUid)
    ) {
        return;
    }

    const peer = makePeer(caller, callSnapshot.ref);

    try {
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
        setStatus("Could not answer the voice call.");
    }
}

function processIncomingCalls() {
    incomingCalls.forEach((snapshot) => {
        void answerIncomingCall(snapshot);
    });
}

function watchParticipants() {
    if (!roomId) return;

    stopParticipants?.();
    participants.clear();
    renderParticipants();

    stopParticipants = onSnapshot(
        collection(db, "voiceRooms", roomId, "participants"),
        (snapshot) => {
            const fresh = new Map();

            snapshot.forEach((entry) => {
                const data = entry.data();
                const heartbeatAt = Number(data.heartbeatAt || 0);

                if (
                    data.uid &&
                    data.name &&
                    Date.now() - heartbeatAt < STALE_AFTER_MS
                ) {
                    fresh.set(data.uid, {
                        uid: data.uid,
                        name: data.name,
                        sessionId: data.sessionId,
                        heartbeatAt
                    });
                }
            });

            participants.clear();
            fresh.forEach((value, key) => participants.set(key, value));

            renderParticipants();

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
            console.error("Voice presence listener failed:", error);
            setStatus("Could not read voice members.");
        }
    );
}

function watchIncomingCalls() {
    if (!roomId || !user) return;

    stopCalls?.();

    stopCalls = onSnapshot(
        query(
            collection(db, "voiceRooms", roomId, "calls"),
            where("calleeUid", "==", user.uid)
        ),
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

async function joinOrLeave() {
    if (!user) {
        setStatus("Sign in before joining a voice lounge.");
        return;
    }

    if (!selectedChannel || !roomId) {
        setStatus("Click a voice lounge first.");
        return;
    }

    if (localStream) {
        await leaveVoice();
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Microphone access requires HTTPS and a supported browser.");
        return;
    }

    joinButton.disabled = true;
    setStatus("Requesting microphone permission...");

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        sessionId =
            globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        muted = false;
        muteButton.disabled = false;
        muteButton.textContent = "Mute";
        joinButton.textContent = "Leave Voice";

        const presenceRef = doc(
            db,
            "voiceRooms",
            roomId,
            "participants",
            user.uid
        );

        const heartbeat = () =>
            setDoc(presenceRef, {
                uid: user.uid,
                name: (user.displayName || "Member").slice(0, 80),
                sessionId,
                heartbeatAt: Date.now()
            });

        await heartbeat();

        heartbeatTimer = window.setInterval(() => {
            if (localStream) {
                heartbeat().catch((error) => {
                    console.warn("Presence refresh failed:", error);
                });
            }
        }, HEARTBEAT_MS);

        watchIncomingCalls();
        setStatus(`Connected to ${selectedChannel}`);
    } catch (error) {
        console.error("Unable to join voice:", error);

        localStream?.getTracks().forEach((track) => track.stop());
        localStream = null;

        joinButton.textContent = "Join Voice";
        muteButton.disabled = true;

        setStatus(
            error.name === "NotAllowedError"
                ? "Microphone permission was blocked."
                : "Could not join voice. Check microphone access and Firebase rules."
        );
    } finally {
        joinButton.disabled = false;
    }
}

async function leaveVoice() {
    const oldRoom = roomId;
    const oldUid = user?.uid;

    if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
    }

    heartbeatTimer = null;

    stopCalls?.();
    stopCalls = null;

    stopParticipants?.();
    stopParticipants = null;

    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;

    closeAllPeers();
    incomingCalls.clear();
    participants.clear();

    muted = false;

    if (muteButton) {
        muteButton.disabled = true;
        muteButton.textContent = "Mute";
    }

    if (joinButton) {
        joinButton.textContent = "Join Voice";
    }

    renderParticipants();

    await Promise.allSettled(
        [...outgoingCalls.values()].map((callRef) => deleteDoc(callRef))
    );

    outgoingCalls.clear();

    if (oldRoom && oldUid) {
        try {
            await deleteDoc(
                doc(db, "voiceRooms", oldRoom, "participants", oldUid)
            );
        } catch (error) {
            console.warn("Presence will expire automatically:", error);
        }
    }

    setStatus(
        selectedChannel ? `Left ${selectedChannel}` : "Not connected"
    );
}

function toggleMute() {
    if (!localStream) return;

    muted = !muted;

    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
    });

    muteButton.textContent = muted ? "Unmute" : "Mute";

    setStatus(
        `${muted ? "Muted in" : "Connected to"} ${selectedChannel}`
    );
}

async function selectVoiceChannel(channel) {
    const nextName = channel.dataset.voiceName || channel.textContent.trim();
    const nextRoom = makeRoomId(nextName);

    const isSameOpenChannel =
        channel.classList.contains("active") &&
        panel &&
        !panel.hidden;

    if (isSameOpenChannel) {
        if (localStream) {
            await leaveVoice();
        }

        channel.classList.remove("active");
        channel.setAttribute("aria-expanded", "false");
        panel.hidden = true;

        stopParticipants?.();
        stopParticipants = null;

        selectedChannel = null;
        roomId = null;
        return;
    }

    if (localStream && nextRoom !== roomId) {
        await leaveVoice();
    }

    channelItems.forEach((item) => {
        item.classList.toggle("active", item === channel);
        item.setAttribute(
            "aria-expanded",
            String(item === channel)
        );
    });

    selectedChannel = nextName;
    roomId = nextRoom;

    if (panel && panel.parentElement !== channel.parentElement) {
        channel.parentElement.appendChild(panel);
    }

    if (panel) panel.hidden = false;

    watchParticipants();

    if (localStream) {
        watchIncomingCalls();
    }

    setStatus(
        localStream
            ? `Connected to ${selectedChannel}`
            : `Selected ${selectedChannel} - join to talk`
    );
}

channelItems.forEach((channel) => {
    channel.setAttribute("aria-expanded", "false");

    channel.addEventListener("click", () => {
        void selectVoiceChannel(channel);
    });
});

joinButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    void joinOrLeave();
});

muteButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMute();
});

textButton?.addEventListener("click", (event) => {
    event.stopPropagation();

    if (!selectedChannel) return;

    const textChannel = makeRoomId(selectedChannel);

    if (typeof window.openTextChannel === "function") {
        window.openTextChannel(textChannel);
    }
});

onAuthStateChanged(auth, (nextUser) => {
    user = nextUser;

    if (!nextUser) {
        if (localStream) void leaveVoice();
        return;
    }

    if (selectedChannel) {
        watchParticipants();
    }
});

window.leaveVoiceChat = leaveVoice;

window.addEventListener("pagehide", () => {
    if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
    }

    localStream?.getTracks().forEach((track) => track.stop());
    closeAllPeers();
});

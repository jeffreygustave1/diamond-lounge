import { auth, db, storage } from "./firebase.js";
import { getDownloadURL, ref as storageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-storage.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
    addDoc,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

// ==================================================
// DIAMOND LOUNGE — MAIN ELEMENTS
// ==================================================

const messagesElement = document.getElementById("messages");
const input = document.getElementById("messageInput");
const messageForm = document.getElementById("messageForm");
const sendButton = document.getElementById("sendMessageButton");
const activeChannelName = document.getElementById("activeChannelName");
const activeChannelDescription = document.getElementById("activeChannelDescription");
const textChannelButtons = [...document.querySelectorAll(".text-channel")];

const dashboard = document.querySelector(".dashboard");
const mobileSidebarBackdrop = document.getElementById("mobileSidebarBackdrop");
const mobileMenuButtons = document.querySelectorAll(".mobile-menu-button");

const dmHomeButton = document.getElementById("dmHomeButton");
const mainServerButton = document.getElementById("mainServerButton");
const logoutButton = document.getElementById("logoutButton");
const loungeSidebar = document.getElementById("loungeSidebar");
const dmSidebar = document.getElementById("dmSidebar");
const emptyView = document.getElementById("emptyView");
const serverView = document.getElementById("serverView");
const serverViewName = document.getElementById("serverViewName");
const serverViewVisibility = document.getElementById("serverViewVisibility");
const serverWelcomeName = document.getElementById("serverWelcomeName");
const loungeView = document.getElementById("loungeView");
const dmHomeView = document.getElementById("dmHomeView");
const dmConversationView = document.getElementById("dmConversationView");
const communitySidebar = document.getElementById("communitySidebar");

const memberSearch = document.getElementById("memberSearch");
const dmMemberList = document.getElementById("dmMemberList");
const dmContactName = document.getElementById("dmContactName");
const dmMessages = document.getElementById("dmMessages");
const dmMessageForm = document.getElementById("dmMessageForm");
const dmMessageInput = document.getElementById("dmMessageInput");
const dmSendButton = document.getElementById("dmSendButton");
const dmStatus = document.getElementById("dmStatus");

const createServerButton = document.getElementById("createServerButton");
const serverModal = document.getElementById("serverModal");
const closeServerModalButton = document.getElementById("closeServerModal");
const cancelServerCreation = document.getElementById("cancelServerCreation");
const createServerForm = document.getElementById("createServerForm");
const createdServers = document.getElementById("createdServers");
const serverNameInput = document.getElementById("serverName");
const serverVisibilityInput = document.getElementById("serverVisibility");
const serverCreateStatus = document.getElementById("serverCreateStatus");

// Profile elements
const profileName = document.getElementById("profileName");
const currentUserElement = document.getElementById("currentUser");
const profileButton = document.getElementById("profileButton");
const profileModal = document.getElementById("profileModal");
const closeProfileModalButton = document.getElementById("closeProfileModal");
const cancelProfileEdit = document.getElementById("cancelProfileEdit");
const profileForm = document.getElementById("profileForm");
const profileDisplayName = document.getElementById("profileDisplayName");
const profileStatus = document.getElementById("profileStatus");
const profilePreviewImage = document.getElementById("profilePreviewImage");
const myProfilePicture = document.getElementById("myProfilePicture");
const profileUploadInput = document.getElementById("profileUploadInput");
const profileCrop = document.getElementById("profileCrop");
const cropImage = document.getElementById("cropImage");
const cropZoom = document.getElementById("cropZoom");
const profileChoiceButtons = [...document.querySelectorAll(".profile-choice")];

// Prevent decorative workspace gems from intercepting clicks.
document.querySelectorAll(".workspace-gem").forEach((gem) => {
    gem.style.setProperty("pointer-events", "none", "important");
});

// ==================================================
// APPLICATION STATE
// ==================================================

const channelDescriptions = {
    general: "A little space to share what matters.",
    announcements: "Important Diamond Lounge news and updates.",
    streaming: "Share streams, clips, schedules, and creator updates."
};

let currentUser = null;
let activeTextChannel = null;
let activeCreatedServerId = null;
let activeCreatedServerOwnerUid = null;
let currentServerCanManageChannels = false;

let stopMessagesListener = null;
let stopMembersListener = null;
let stopDirectMessagesListener = null;
// ==================================================
// CREATED SERVER CHANNEL STATE
// ==================================================

let stopServerChannelsListener = null;
let stopCreatedServerMessagesListener = null;

let activeCreatedServerChannelId = null;
let activeCreatedServerChannelType = "text";
let createdServerChannels = [];
let createdServerVoicePresenceStop = null;
let pendingInviteServer = null;
let pendingInviteChannelId = null;

const createdServerTextChannels = document.getElementById("createdServerTextChannels");
const createdServerVoiceChannels = document.getElementById("createdServerVoiceChannels");
const addServerChannelButton = document.getElementById("addServerChannelButton");
const createdServerActiveChannel = document.getElementById("createdServerActiveChannel");
const createdServerChannelSymbol = document.getElementById("createdServerChannelSymbol");
const createdServerMessages = document.getElementById("createdServerMessages");
const createdServerMessageForm = document.getElementById("createdServerMessageForm");
const createdServerMessageInput = document.getElementById("createdServerMessageInput");
const createdServerSendButton = document.getElementById("createdServerSendButton");
const createdServerMessageStatus = document.getElementById("createdServerMessageStatus");

let members = [];
let selectedMember = null;
let currentConversationId = null;
let serverContextMenu = null;
let serverLongPressTimer = null;
let suppressServerClick = false;

let currentAvatar = "diamond";
let uploadedPicture = "";
let rawPicture = "";
let cropScale = 1;
let cropX = 0;
let cropY = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;

function normalizeServerName(name) {
    return String(name || "")
        .trim()
        .normalize("NFKC")
        .toLocaleLowerCase("en-US");
}

const SERVER_PERMISSION_OPTIONS = [
    ["manageChannels", "Manage channels"],
    ["manageEvents", "Manage events"],
    ["manageInvites", "Manage invites"],
    ["manageMessages", "Manage messages"]
];

async function currentServerHasPermission(permission) {
    if (!currentUser || !activeCreatedServerId) return false;
    if (activeCreatedServerOwnerUid === currentUser.uid) return true;
    try {
        const membership = await getDoc(doc(
            db, "servers", activeCreatedServerId, "members", currentUser.uid
        ));
        if (!membership.exists()) return false;
        const permissions = membership.data().permissions;
        return Array.isArray(permissions) &&
            (permissions.includes("*") || permissions.includes(permission));
    } catch (error) {
        console.warn("Server permission check failed:", error);
        return false;
    }
}

async function refreshServerMemberPermissions(serverId) {
    const serverSnapshot = await getDoc(doc(db, "servers", serverId));
    if (!serverSnapshot.exists()) return;
    const roleSnapshot = await getDocs(collection(db, "servers", serverId, "roles"));
    const roles = new Map(roleSnapshot.docs.map(entry => [
        entry.id, Array.isArray(entry.data().permissions) ? entry.data().permissions : []
    ]));
    const memberUids = serverSnapshot.data().memberUids || [];
    await Promise.all(memberUids.map(async uid => {
        const memberRef = doc(db, "servers", serverId, "members", uid);
        const memberSnapshot = await getDoc(memberRef);
        if (!memberSnapshot.exists()) return;
        const storedRoleIds = memberSnapshot.data().roleIds;
        const roleIds = Array.isArray(storedRoleIds)
            ? storedRoleIds
            : (uid === serverSnapshot.data().ownerUid ? ["owner"] : ["member"]);
        const effective = new Set();
        roleIds.forEach(roleId => (roles.get(roleId) || []).forEach(permission => effective.add(permission)));
        if (uid === serverSnapshot.data().ownerUid) effective.add("*");
        await updateDoc(memberRef, { roleIds, permissions: [...effective] });
    }));
}

// ==================================================
// MOBILE NAVIGATION
// ==================================================

function setMobileSidebar(open) {
    if (!dashboard) return;

    dashboard.classList.toggle("mobile-nav-open", open);

    mobileMenuButtons.forEach((button) => {
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute(
            "aria-label",
            open ? "Close navigation menu" : "Open navigation menu"
        );
    });
}

mobileMenuButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setMobileSidebar(!dashboard?.classList.contains("mobile-nav-open"));
    });
});

mobileSidebarBackdrop?.addEventListener("click", () => {
    setMobileSidebar(false);
});

// ==================================================
// VIEW AND LISTENER MANAGEMENT
// ==================================================

function stopPublicMessages() {
    stopMessagesListener?.();
    stopMessagesListener = null;
}

function stopDirectMessages() {
    stopDirectMessagesListener?.();
    stopDirectMessagesListener = null;
}

function stopMemberListener() {
    stopMembersListener?.();
    stopMembersListener = null;
}
function stopCreatedServerChannels() {
    stopServerChannelsListener?.();
    stopServerChannelsListener = null;

    stopCreatedServerMessagesListener?.();
    stopCreatedServerMessagesListener = null;

    createdServerVoicePresenceStop?.();
    createdServerVoicePresenceStop = null;

    activeCreatedServerChannelId = null;
    activeCreatedServerChannelType = "text";
    createdServerChannels = [];
    activeCreatedServerOwnerUid = null;
    currentServerCanManageChannels = false;
}

function hideMainViews() {
    if (emptyView) emptyView.hidden = true;
    if (serverView) serverView.hidden = true;
    if (loungeView) loungeView.hidden = true;
    if (dmHomeView) dmHomeView.hidden = true;
    if (dmConversationView) dmConversationView.hidden = true;
}

function clearServerSelections() {
    document.querySelectorAll(".server-icon").forEach((icon) => {
        icon.classList.remove("selected");
        icon.setAttribute("aria-pressed", "false");
    });
}

function showLoungeSidebar() {
    if (dmSidebar) dmSidebar.hidden = true;
    if (loungeSidebar) loungeSidebar.hidden = false;

    if (dmHomeButton) {
        dmHomeButton.classList.remove("selected");
        dmHomeButton.setAttribute("aria-pressed", "false");
    }

    if (mainServerButton) {
        mainServerButton.classList.add("selected");
        mainServerButton.setAttribute("aria-pressed", "true");
    }

    document.body.classList.remove("dm-mode");
}

function showEmptyView() {
    stopPublicMessages();

    activeTextChannel = null;
    activeCreatedServerId = null;
    activeCreatedServerOwnerUid = null;
    currentServerCanManageChannels = false;

    hideMainViews();

    if (emptyView) emptyView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = true;

    textChannelButtons.forEach((button) => {
        button.classList.remove("selected");
        button.setAttribute("aria-pressed", "false");
    });
}

// ==================================================
// TEXT CHANNELS
// ==================================================

function openTextChannel(channelName) {
    if (!currentUser || !channelName) return;

    // Release created-server channel listeners when returning to VIP-LOUNGE.
    stopCreatedServerChannels();

    if (
        activeTextChannel === channelName &&
        loungeView &&
        !loungeView.hidden
    ) {
        showEmptyView();
        setMobileSidebar(false);
        return;
    }

    stopDirectMessages();

    activeCreatedServerId = null;
    showLoungeSidebar();
showEmptyView();
setMobileSidebar(true);

    if (loungeView) loungeView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = false;

    activeTextChannel = channelName;

    if (activeChannelName) {
        activeChannelName.textContent = channelName;
    }

    if (activeChannelDescription) {
        activeChannelDescription.textContent =
            channelDescriptions[channelName] || `Welcome to #${channelName}.`;
    }

    if (input) {
        input.placeholder = `Message #${channelName}`;
    }

    textChannelButtons.forEach((button) => {
        const selected = button.dataset.channel === channelName;

        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

    clearServerSelections();

    loadMessages(channelName);
    setMobileSidebar(false);
}

textChannelButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openTextChannel(button.dataset.channel);
    });
});

window.openTextChannel = openTextChannel;

// ==================================================
// AUTHENTICATION AND USER PROFILE SETUP
// ==================================================

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("login.html");
        return;
    }

    currentUser = user;

    const displayName = (user.displayName || "Member").slice(0, 30);

    if (profileName) {
        profileName.textContent = displayName;
    }

    const currentName = currentUserElement?.querySelector("span");

    if (currentName) {
        currentName.textContent = displayName;
    }

    try {
        await ensureUserProfile();
        loadMembers();
    } catch (error) {
        console.error("Profile setup failed:", error);

        if (dmMemberList) {
            dmMemberList.textContent = "Member profiles could not load.";
        }
    }

    await loadProfile();
    await loadServerIcons();
    await consumeServerInviteFromUrl();

    // Start with no server or channel selected.
    stopCreatedServerChannels();
    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    activeCreatedServerId = null;
    selectedMember = null;
    currentConversationId = null;

    if (loungeSidebar) loungeSidebar.hidden = true;
    if (dmSidebar) dmSidebar.hidden = true;
    if (communitySidebar) communitySidebar.hidden = true;

    hideMainViews();

    if (emptyView) emptyView.hidden = false;

    clearServerSelections();

    if (mainServerButton) {
        mainServerButton.classList.remove("selected");
        mainServerButton.setAttribute("aria-pressed", "false");
    }

    if (dmHomeButton) {
        dmHomeButton.classList.remove("selected");
        dmHomeButton.setAttribute("aria-pressed", "false");
    }

    document.body.classList.remove("dm-mode");
    setMobileSidebar(false);

    if (pendingInviteServer) {
        const invitedServer = pendingInviteServer;
        pendingInviteServer = null;
        openServer(invitedServer);
    }
});

async function consumeServerInviteFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const serverId = params.get("serverInvite");
    const inviteCode = params.get("invite");
    if (!serverId || !inviteCode || !currentUser) return;

    const inviteRef = doc(db, "servers", serverId, "invites", inviteCode);
    const serverRef = doc(db, "servers", serverId);
    const joinRequestRef = doc(db, "servers", serverId, "joinRequests", currentUser.uid);
    try {
        const [inviteSnapshot, serverSnapshot] = await Promise.all([
            getDoc(inviteRef),
            getDoc(serverRef)
        ]);
        if (!inviteSnapshot.exists()) {
            alert("This server invite is invalid or has expired.");
            return;
        }
        if (!serverSnapshot.exists()) {
            alert("The invited server no longer exists.");
            return;
        }

        const serverData = serverSnapshot.data();
        const memberUids = serverData.memberUids || [];
        if (!memberUids.includes(currentUser.uid)) {
            // Firestore rules validate this request against the invite document.
            await setDoc(joinRequestRef, {
                uid: currentUser.uid,
                inviteCode,
                createdAt: serverTimestamp()
            });
            await updateDoc(serverRef, {
                memberUids: arrayUnion(currentUser.uid)
            });
            await deleteDoc(joinRequestRef);
        }

        const memberRef = doc(db, "servers", serverId, "members", currentUser.uid);
        const memberSnapshot = await getDoc(memberRef);
        if (!memberSnapshot.exists() && currentUser.uid !== serverData.ownerUid) {
            await setDoc(memberRef, {
                uid: currentUser.uid,
                displayName: currentUser.displayName || currentUser.email?.split("@")[0] || "Member",
                roleIds: ["member"],
                permissions: ["viewChannels", "sendMessages", "connectVoice", "speak"],
                joinedAt: serverTimestamp()
            });
        }

        const url = new URL(window.location.href);
        ["serverInvite", "invite", "inviteChannel"].forEach(key => url.searchParams.delete(key));
        window.history.replaceState({}, "", url.toString());
        await loadServerIcons();
        pendingInviteServer = {
            id: serverId,
            name: serverData.name || "Server",
            visibility: serverData.visibility || "private",
            ownerUid: serverData.ownerUid || ""
        };
        pendingInviteChannelId = inviteSnapshot.data().channelId || params.get("inviteChannel") || null;
        alert("You joined " + (serverData.name || "the server") + "!");
    } catch (error) {
        console.error("Invite join flow failed:", error);
        try { await deleteDoc(joinRequestRef); } catch {}
        alert(error.code === "permission-denied"
            ? "Firebase blocked this join. Publish the latest Firestore rules and try the invite again."
            : "Unable to join using this invite.");
    }
}

async function ensureUserProfile() {
    if (!currentUser) return;

    const userRef = doc(db, "users", currentUser.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: (currentUser.displayName || "Member").slice(0, 30),
            createdAt: serverTimestamp()
        });
    }
}

// ==================================================
// PUBLIC MESSAGES
// ==================================================

function loadMessages(channelName) {
    if (!messagesElement || !channelName) return;

    stopPublicMessages();
    messagesElement.textContent = "Loading messages...";

    const messagesQuery = query(
        collection(db, "messages"),
        where("channelId", "==", channelName),
        orderBy("timestamp", "asc"),
        limit(100)
    );

    stopMessagesListener = onSnapshot(
        messagesQuery,
        (snapshot) => {
            if (activeTextChannel !== channelName) return;

            messagesElement.replaceChildren();

            if (snapshot.empty) {
                const empty = document.createElement("p");
                empty.className = "channel-empty";
                empty.textContent = `This is the beginning of #${channelName}.`;
                messagesElement.appendChild(empty);
                return;
            }

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

                messagesElement.appendChild(message);
            });

            messagesElement.scrollTop = messagesElement.scrollHeight;
        },
        (error) => {
            console.error("Channel listener failed:", error);

            messagesElement.textContent =
                error.code === "failed-precondition"
                    ? "This channel requires a Firestore index."
                    : error.code === "permission-denied"
                        ? "Firestore denied channel access. Publish the updated rules."
                        : "Messages could not load.";
        }
    );
}

async function sendMessage() {
    if (!currentUser || !input || !sendButton || !activeTextChannel) return;

    const text = input.value.trim();
    if (!text) return;

    sendButton.disabled = true;

    try {
        await addDoc(collection(db, "messages"), {
            uid: currentUser.uid,
            username: (currentUser.displayName || "Member").slice(0, 30),
            channelId: activeTextChannel,
            text: text.slice(0, 2000),
            timestamp: serverTimestamp()
        });

        input.value = "";
        input.focus();
    } catch (error) {
        console.error("Message send failed:", error);

        alert(
            error.code === "permission-denied"
                ? "Firestore denied this message. Publish the updated rules."
                : "Message could not be sent."
        );
    } finally {
        sendButton.disabled = false;
    }
}

messageForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
});

// ==================================================
// DIRECT MESSAGES
// ==================================================

function showDirectMessages() {
    if (!currentUser) return;

    // Prevent server listeners from lingering while viewing DMs.
    stopCreatedServerChannels();

    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    activeCreatedServerId = null;
    selectedMember = null;
    currentConversationId = null;

    if (loungeSidebar) loungeSidebar.hidden = true;
    if (dmSidebar) dmSidebar.hidden = false;

    hideMainViews();

    if (dmHomeView) dmHomeView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = true;

    if (dmHomeButton) {
        dmHomeButton.classList.add("selected");
        dmHomeButton.setAttribute("aria-pressed", "true");
    }

    if (mainServerButton) {
        mainServerButton.classList.remove("selected");
        mainServerButton.setAttribute("aria-pressed", "false");
    }

    clearServerSelections();

    document.body.classList.add("dm-mode");

    if (memberSearch) {
        memberSearch.value = "";
        renderMembers();
    }
}

dmHomeButton?.addEventListener("click", (event) => {
    event.preventDefault();

    const inDirectMessages =
        (dmHomeView && !dmHomeView.hidden) ||
        (dmConversationView && !dmConversationView.hidden);

    if (inDirectMessages) {
        showLoungeSidebar();
        showEmptyView();
    } else {
        showDirectMessages();
    }

    setMobileSidebar(false);
});

mainServerButton?.addEventListener("click", () => {
    stopCreatedServerChannels();
    stopDirectMessages();

    activeTextChannel = null;
    activeCreatedServerId = null;
    selectedMember = null;
    currentConversationId = null;

    showLoungeSidebar();
    showEmptyView();
    clearServerSelections();

    if (mainServerButton) {
        mainServerButton.classList.add("selected");
        mainServerButton.setAttribute("aria-pressed", "true");
    }

    setMobileSidebar(false);
});

function loadMembers() {
    if (!dmMemberList) return;

    stopMemberListener();

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
            dmMemberList.textContent = "Members could not load.";
        }
    );
}

function renderMembers() {
    if (!dmMemberList) return;

    dmMemberList.replaceChildren();

    const searchText = (memberSearch?.value || "").trim().toLowerCase();

    const filtered = members.filter((member) =>
        member.displayName.toLowerCase().includes(searchText)
    );

    if (!filtered.length) {
        const empty = document.createElement("li");
        empty.className = "dm-empty";
        empty.textContent = searchText
            ? "No members match your search."
            : "No other members have joined yet.";

        dmMemberList.appendChild(empty);
        return;
    }

    filtered.forEach((member) => {
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

memberSearch?.addEventListener("input", renderMembers);

function getConversationId(firstUid, secondUid) {
    return [firstUid, secondUid].sort().join("_");
}

async function openConversation(member) {
    if (!currentUser || !member?.uid) return;

    stopDirectMessages();

    activeCreatedServerId = null;
    selectedMember = member;

    currentConversationId = getConversationId(
        currentUser.uid,
        member.uid
    );

    const openingId = currentConversationId;

    hideMainViews();

    if (dmConversationView) dmConversationView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = true;
    if (dmContactName) dmContactName.textContent = member.displayName;

    renderMembers();
    setMobileSidebar(false);

    if (dmMessages) {
        dmMessages.textContent = "Opening private conversation...";
    }

    try {
        const conversationRef = doc(db, "conversations", openingId);
        const snapshot = await getDoc(conversationRef);

        if (!snapshot.exists()) {
            await setDoc(conversationRef, {
                participantUids: [currentUser.uid, member.uid],
                createdAt: serverTimestamp()
            });
        }

        if (currentConversationId === openingId) {
            loadDirectMessages();
        }
    } catch (error) {
        console.error("Private conversation failed:", error);

        if (dmMessages) {
            dmMessages.textContent =
                "This private conversation could not be opened.";
        }
    }
}

function loadDirectMessages() {
    if (!currentConversationId || !dmMessages) return;

    stopDirectMessages();

    const privateQuery = query(
        collection(db, "conversations", currentConversationId, "messages"),
        orderBy("timestamp", "asc"),
        limit(100)
    );

    stopDirectMessagesListener = onSnapshot(
        privateQuery,
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
            dmMessages.textContent = "Private messages could not load.";
        }
    );
}

async function sendDirectMessage() {
    if (
        !currentUser ||
        !currentConversationId ||
        !selectedMember ||
        !dmMessageInput ||
        !dmSendButton
    ) return;

    const text = dmMessageInput.value.trim();
    if (!text) return;

    dmSendButton.disabled = true;

    try {
        await addDoc(
            collection(db, "conversations", currentConversationId, "messages"),
            {
                uid: currentUser.uid,
                username: (currentUser.displayName || "Member").slice(0, 30),
                text: text.slice(0, 2000),
                timestamp: serverTimestamp()
            }
        );

        dmMessageInput.value = "";
        dmMessageInput.focus();
    } catch (error) {
        console.error("Private message send failed:", error);

        if (dmStatus) {
            dmStatus.textContent = "Your message could not be sent.";
            dmStatus.classList.add("error");
        }
    } finally {
        dmSendButton.disabled = false;
    }
}

dmMessageForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendDirectMessage();
});

// ==================================================
// CREATE SERVER MODAL AND SERVER CREATION
// ==================================================

function openServerModal() {
    if (!serverModal) return;

    serverModal.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(() => serverNameInput?.focus());
}

function closeServerModal() {
    if (!serverModal || serverModal.hidden) return;

    serverModal.hidden = true;
    document.body.classList.remove("modal-open");

    createServerForm?.reset();

    if (serverCreateStatus) {
        serverCreateStatus.textContent = "";
    }
}

createServerButton?.addEventListener("click", openServerModal);
closeServerModalButton?.addEventListener("click", closeServerModal);
cancelServerCreation?.addEventListener("click", closeServerModal);

serverModal?.addEventListener("click", (event) => {
    if (event.target === serverModal) {
        closeServerModal();
    }
});

function hasCreatedServerName(name) {
    const wantedName = normalizeServerName(name);

    if (!createdServers || !wantedName) return false;

    return [...createdServers.querySelectorAll(".created-server")].some(
        (button) => normalizeServerName(button.title) === wantedName
    );
}

createServerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !serverNameInput || !serverVisibilityInput) return;

    const name = serverNameInput.value.trim();
    const normalizedName = normalizeServerName(name);

    if (name.length < 2 || name.length > 40) {
        if (serverCreateStatus) {
            serverCreateStatus.textContent =
                "Server names must be between 2 and 40 characters.";
        }
        return;
    }

    if (normalizedName === "vip-lounge") {
        if (serverCreateStatus) {
            serverCreateStatus.textContent =
                "VIP-LOUNGE is the default community and already exists.";
        }
        return;
    }

    if (hasCreatedServerName(name)) {
        if (serverCreateStatus) {
            serverCreateStatus.textContent =
                "A server with that name is already shown in your sidebar.";
        }
        return;
    }

    const createButton = document.getElementById("confirmCreateServer");

    if (createButton) {
        createButton.disabled = true;
    }

    try {
        
    
    const serverRef = await addDoc(collection(db, "servers"), {
    name,
    nameLower: normalizedName,
    visibility: serverVisibilityInput.value,
    ownerUid: currentUser.uid,
    memberUids: [currentUser.uid],
    createdAt: serverTimestamp()
});

// ================================================
// INITIALIZE SERVER ROLES
// ================================================

const serverId = serverRef.id;

const serverRolesRef = collection(db, "servers", serverId, "roles");

await Promise.all([
    setDoc(doc(serverRolesRef, "owner"), {
        name: "Owner",
        nameLower: "owner",
        permissions: ["*"],
        position: 100,
        managed: true,
        createdAt: serverTimestamp()
    }),

    setDoc(doc(serverRolesRef, "admin"), {
        name: "Admin",
        nameLower: "admin",
        permissions: [
            "manageChannels",
            "manageEvents",
            "manageMessages",
            "manageInvites"
        ],
        position: 80,
        managed: false,
        createdAt: serverTimestamp()
    }),

    setDoc(doc(serverRolesRef, "moderator"), {
        name: "Moderator",
        nameLower: "moderator",
        permissions: [
            "manageMessages"
        ],
        position: 50,
        managed: false,
        createdAt: serverTimestamp()
    }),

    setDoc(doc(serverRolesRef, "member"), {
        name: "Member",
        nameLower: "member",
        permissions: [
            "viewChannels",
            "sendMessages",
            "connectVoice",
            "speak"
        ],
        position: 10,
        managed: false,
        createdAt: serverTimestamp()
    })
]);

// ================================================
// INITIALIZE SERVER OWNER MEMBERSHIP
// ================================================

await setDoc(
    doc(db, "servers", serverId, "members", currentUser.uid),
    {
        uid: currentUser.uid,
        roleIds: ["owner"],
        permissions: ["*"],
        joinedAt: serverTimestamp()
    }
);

        closeServerModal();

        const server = {
            id: serverRef.id,
            name,
            visibility: serverVisibilityInput.value,
            ownerUid: currentUser.uid
        };

        if (createdServers) {
            server.button = makeServerIcon(server);
            createdServers.appendChild(server.button);
        }

        openServer(server);
    } catch (error) {
        console.error("Server creation failed:", error);

        if (serverCreateStatus) {
            serverCreateStatus.textContent =
                error.code === "permission-denied"
                    ? "Firebase rejected this. Check the servers Firestore rule."
                    : "The server could not be created.";
        }
    } finally {
        if (createButton) {
            createButton.disabled = false;
        }
    }
});

// ==================================================
// CREATED SERVER CHANNELS AND MESSAGES
// ==================================================

function loadCreatedServerChannels(serverId) {
    if (!serverId || !createdServerTextChannels || !createdServerVoiceChannels) {
        return;
    }

    stopServerChannelsListener?.();
    stopServerChannelsListener = null;

    stopCreatedServerMessages();
    activeCreatedServerChannelId = null;
    createdServerChannels = [];

    createdServerTextChannels.replaceChildren();
    createdServerVoiceChannels.replaceChildren();

    if (createdServerMessages) {
        createdServerMessages.textContent = "Loading channels...";
    }

    const channelsRef = collection(db, "servers", serverId, "channels");

    stopServerChannelsListener = onSnapshot(
        query(channelsRef, orderBy("createdAt", "asc")),
        async (snapshot) => {
            if (activeCreatedServerId !== serverId) return;

            createdServerChannels = snapshot.docs.map((entry) => ({
                id: entry.id,
                ...entry.data()
            }));

            if (snapshot.empty) {
                try {
                    await addDoc(channelsRef, {
                        name: "general",
                        nameLower: "general",
                        type: "text",
                        createdBy: currentUser.uid,
                        createdAt: serverTimestamp()
                    });
                } catch (error) {
                    console.error("Default channel creation failed:", error);

                    if (createdServerMessages) {
                        createdServerMessages.textContent =
                            "The default channel could not be created.";
                    }
                }

                return;
            }

            renderCreatedServerChannels();

            if (pendingInviteChannelId) {
                const invitedChannel = createdServerChannels.find(channel => channel.id === pendingInviteChannelId);
                pendingInviteChannelId = null;
                if (invitedChannel) {
                    if (invitedChannel.type === "voice") openCreatedServerVoiceChannel(invitedChannel);
                    else if (invitedChannel.type === "text") openCreatedServerChannel(invitedChannel);
                    return;
                }
            }

            const selectedChannel = createdServerChannels.find(
    (channel) =>
        channel.id === activeCreatedServerChannelId &&
        channel.type === activeCreatedServerChannelType
);

if (selectedChannel) {
                return;
            }

            const firstTextChannel = createdServerChannels.find(
                (channel) => channel.type === "text"
            );

            if (firstTextChannel) {
                openCreatedServerChannel(firstTextChannel);
            } else {
                stopCreatedServerMessages();

                activeCreatedServerChannelId = null;

                if (createdServerActiveChannel) {
                    createdServerActiveChannel.textContent = "No text channels";
                }

                if (createdServerChannelSymbol) {
                    createdServerChannelSymbol.textContent = "#";
                }

                if (createdServerMessages) {
                    createdServerMessages.textContent =
                        "This server has no text channels yet. Create one to start chatting.";
                }

                if (createdServerMessageInput) {
                    createdServerMessageInput.disabled = true;
                }

                if (createdServerSendButton) {
                    createdServerSendButton.disabled = true;
                }
            }
        },
        (error) => {
            console.error("Server channels failed to load:", error);

            createdServerTextChannels.textContent =
                "Channels could not load.";

            createdServerVoiceChannels.textContent =
                "Channels could not load.";

            if (createdServerMessages) {
                createdServerMessages.textContent =
                    error.code === "permission-denied"
                        ? "Firebase denied channel access. Check your Firestore rules."
                        : "Channels could not load.";
            }
        }
    );
}

function renderCreatedServerChannels() {
    if (!createdServerTextChannels || !createdServerVoiceChannels) return;
    createdServerTextChannels.replaceChildren();
    createdServerVoiceChannels.replaceChildren();

    const categories = createdServerChannels.filter(c => c.type === "category");
    const texts = createdServerChannels.filter(c => c.type === "text");
    const voices = createdServerChannels.filter(c => c.type === "voice");
    const canManageChannels = currentServerCanManageChannels ||
        activeCreatedServerOwnerUid === currentUser?.uid;

    function makeChannelRow(channel) {
        const li = document.createElement("li");
        li.className = "created-server-channel-item";
        li.dataset.channelType = channel.type;
        li.dataset.channelId = channel.id;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "created-server-channel-button";
        const symbol = document.createElement("span");
        symbol.className = "created-server-channel-icon";
        symbol.textContent = channel.type === "voice" ? "◖" : "#";
        const name = document.createElement("span");
        name.className = "created-server-channel-name";
        name.textContent = channel.name;
        button.append(symbol, name);
        button.classList.toggle("selected",
            channel.id === activeCreatedServerChannelId &&
            channel.type === activeCreatedServerChannelType);
        button.onclick = () => channel.type === "text"
            ? openCreatedServerChannel(channel)
            : openCreatedServerVoiceChannel(channel);
        li.append(button);

        // These three actions are exclusive to voice-channel rows.
        if (channel.type === "voice") {
            const actions = document.createElement("div");
            actions.className = "created-server-voice-row-actions";

            const chat = document.createElement("button");
            chat.type = "button";
            chat.title = "Open voice channel chat";
            chat.setAttribute("aria-label", "Open voice channel chat");
            chat.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4z"/></svg>';
            chat.onclick = event => {
                event.stopPropagation();
                void openCreatedServerVoiceChat(channel);
            };

            const invite = document.createElement("button");
            invite.type = "button";
            invite.title = "Invite to channel";
            invite.setAttribute("aria-label", "Invite to channel");
            invite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20v-1c0-3 3-5 8-5s8 2 8 5v1H4zM19 8v6m-3-3h6"/></svg>';
            invite.onclick = event => {
                event.stopPropagation();
                void serverInviteDialog(channel);
            };

            const settings = document.createElement("button");
            settings.type = "button";
            settings.title = "Voice channel settings";
            settings.setAttribute("aria-label", "Voice channel settings");
            settings.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19 13.5l2-1.2-1-2.1-2.3.4a6.5 6.5 0 0 0-1.3-1.3l.4-2.3-2.1-1-1.2 2a6.5 6.5 0 0 0-1.8 0l-1.2-2-2.1 1 .4 2.3a6.5 6.5 0 0 0-1.3 1.3l-2.3-.4-1 2.1 2 1.2a6.5 6.5 0 0 0 0 1.8l-2 1.2 1 2.1 2.3-.4a6.5 6.5 0 0 0 1.3 1.3l-.4 2.3 2.1 1 1.2-2a6.5 6.5 0 0 0 1.8 0l1.2 2 2.1-1-.4-2.3a6.5 6.5 0 0 0 1.3-1.3l2.3.4 1-2.1-2-1.2a6.5 6.5 0 0 0 0-1.8z"/></svg>';
            settings.onclick = event => {
                event.stopPropagation();
                void serverVoiceChannelSettings(channel);
            };

            actions.append(chat, invite, settings);
            li.append(actions);
        }

        if (canManageChannels) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "created-server-channel-delete";
            remove.textContent = "×";
            remove.title = "Delete channel";
            remove.setAttribute("aria-label", `Delete ${channel.name}`);
            remove.onclick = event => {
                event.stopPropagation();
                void deleteCreatedServerChannel(channel);
            };
            li.append(remove);
        }
        return li;
    }

    function appendCategoryHeading(container, category) {
        const heading = document.createElement("li");
        heading.className = "created-server-category-heading";
        const label = document.createElement("span");
        label.textContent = category.name.toUpperCase();
        heading.append(label);
        if (canManageChannels) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "created-server-channel-delete";
            remove.textContent = "×";
            remove.title = "Delete category";
            remove.setAttribute("aria-label", `Delete category ${category.name}`);
            remove.onclick = () => void deleteCreatedServerChannel(category);
            heading.append(remove);
        }
        container.append(heading);
    }

    function renderChannelList(container, type, channels) {
        const uncategorized = channels.filter(c => !c.parentCategoryId ||
            !categories.some(cat => cat.id === c.parentCategoryId));
        uncategorized.forEach(channel => container.append(makeChannelRow(channel)));

        categories.forEach(category => {
            appendCategoryHeading(container, category);
            channels
                .filter(channel => channel.parentCategoryId === category.id)
                .forEach(channel => {
                    const row = makeChannelRow(channel);
                    row.classList.add("is-categorized");
                    container.append(row);
                });
        });
    }

    renderChannelList(createdServerTextChannels, "text", texts);
    renderChannelList(createdServerVoiceChannels, "voice", voices);
}
// DELETE CREATED SERVER CHANNEL
async function deleteCreatedServerChannel(channel) {
    if (!currentUser || !activeCreatedServerId || !channel?.id ||
        !(await currentServerHasPermission("manageChannels"))) {
        alert("You need the Manage Channels role permission to delete channels.");
        return;
    }

    if (!confirm(`Delete the ${channel.type} channel "${channel.name}"?`)) return;
    const serverId = activeCreatedServerId;

    try {
        await deleteDoc(doc(db, "servers", serverId, "channels", channel.id));
        if (activeCreatedServerChannelId === channel.id) {
            stopCreatedServerMessages();
            activeCreatedServerChannelId = null;
            if (createdServerMessages) createdServerMessages.textContent = "Channel deleted.";
        }
    } catch (error) {
        console.error("Channel deletion failed:", error);
        alert(error.code === "permission-denied"
            ? "Firebase denied channel deletion."
            : "The channel could not be deleted.");
    }
}

// ==================================================
// OPEN CREATED SERVER TEXT CHANNEL
// ==================================================

function openCreatedServerChannel(channel) {
    if (!currentUser || !activeCreatedServerId || !channel?.id) return;

    if (channel.type !== "text") return;

    createdServerVoicePresenceStop?.();
    createdServerVoicePresenceStop = null;
    stopCreatedServerMessages();

    activeCreatedServerChannelId = channel.id;
    activeCreatedServerChannelType = "text";

    if (createdServerActiveChannel) {
        createdServerActiveChannel.textContent = channel.name;
    }

    if (createdServerChannelSymbol) {
        createdServerChannelSymbol.textContent = "#";
    }

    if (createdServerMessageInput) {
        createdServerMessageInput.disabled = false;
        createdServerMessageInput.placeholder =
            `Message #${channel.name}`;
    }

    if (createdServerSendButton) {
        createdServerSendButton.disabled = false;
    }

    if (createdServerMessageStatus) {
        createdServerMessageStatus.textContent = "";
        createdServerMessageStatus.className = "upload-status";
    }

    renderCreatedServerChannels();

    loadCreatedServerMessages(
        activeCreatedServerId,
        channel.id
    );
}

// ==================================================
// CREATED SERVER MESSAGE LISTENER
// ==================================================

function stopCreatedServerMessages() {
    stopCreatedServerMessagesListener?.();
    stopCreatedServerMessagesListener = null;
}

function loadCreatedServerMessages(serverId, channelId) {
    if (!createdServerMessages || !serverId || !channelId) return;

    stopCreatedServerMessages();

    createdServerMessages.textContent = "Loading messages...";

    const messagesRef = collection(
        db,
        "servers",
        serverId,
        "channels",
        channelId,
        "messages"
    );

    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "asc"),
        limit(100)
    );

    stopCreatedServerMessagesListener = onSnapshot(
        messagesQuery,
        (snapshot) => {
            if (
                activeCreatedServerId !== serverId ||
                activeCreatedServerChannelId !== channelId
            ) {
                return;
            }

            createdServerMessages.replaceChildren();

            if (snapshot.empty) {
                const empty = document.createElement("p");
                empty.className = "channel-empty";
                empty.textContent = "This is the beginning of this channel.";

                createdServerMessages.appendChild(empty);
                return;
            }

            snapshot.forEach((entry) => {
                const data = entry.data();

                const message = document.createElement("article");
                message.className = "message";

                if (data.uid === currentUser?.uid) {
                    message.classList.add("own-message");
                }

                const author = document.createElement("strong");
                author.textContent = `${data.username || "Member"}: `;

                message.append(
                    author,
                    document.createTextNode(data.text || "")
                );

                createdServerMessages.appendChild(message);
            });

            createdServerMessages.scrollTop =
                createdServerMessages.scrollHeight;
        },
        (error) => {
            console.error("Created server messages failed:", error);

            createdServerMessages.textContent =
                error.code === "permission-denied"
                    ? "Firebase denied access to messages. Check your Firestore rules."
                    : "Messages could not load.";
        }
    );
}

// ==================================================
// SEND CREATED SERVER MESSAGE
// ==================================================

async function sendCreatedServerMessage() {
    if (
        !currentUser ||
        !activeCreatedServerId ||
        !activeCreatedServerChannelId ||
        activeCreatedServerChannelType !== "text" ||
        !createdServerMessageInput ||
        !createdServerSendButton
    ) {
        return;
    }

    const text = createdServerMessageInput.value.trim();

    if (!text) return;

    const serverId = activeCreatedServerId;
    const channelId = activeCreatedServerChannelId;

    createdServerSendButton.disabled = true;

    try {
        await addDoc(
            collection(
                db,
                "servers",
                serverId,
                "channels",
                channelId,
                "messages"
            ),
            {
                uid: currentUser.uid,
                username: (
                    profileName?.textContent ||
                    currentUser.displayName ||
                    "Member"
                ).slice(0, 30),
                text: text.slice(0, 2000),
                timestamp: serverTimestamp()
            }
        );

        if (
            activeCreatedServerId === serverId &&
            activeCreatedServerChannelId === channelId
        ) {
            createdServerMessageInput.value = "";
            createdServerMessageInput.focus();
        }
    } catch (error) {
        console.error("Created server message failed:", error);

        if (createdServerMessageStatus) {
            createdServerMessageStatus.textContent =
                error.code === "permission-denied"
                    ? "Firebase denied this message. Check your Firestore rules."
                    : "Your message could not be sent.";

            createdServerMessageStatus.classList.add("error");
        }
    } finally {
        if (activeCreatedServerId === serverId &&
            activeCreatedServerChannelId === channelId) {
            createdServerSendButton.disabled = false;
        }
    }
}

createdServerMessageForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendCreatedServerMessage();
});

// ==================================================
// CREATED SERVER VOICE CHANNEL DISPLAY
// ==================================================

function openCreatedServerVoiceChannel(channel){if(!channel?.id||!activeCreatedServerId)return;stopCreatedServerMessages();activeCreatedServerChannelId=channel.id;activeCreatedServerChannelType="voice";if(createdServerActiveChannel)createdServerActiveChannel.textContent=channel.name;if(createdServerChannelSymbol)createdServerChannelSymbol.textContent="◖";if(createdServerMessageInput){createdServerMessageInput.disabled=true;createdServerMessageInput.placeholder="Voice channels do not support text messages.";}if(createdServerSendButton)createdServerSendButton.disabled=true;renderCreatedServerChannels();if(createdServerMessages){createdServerMessages.replaceChildren();const h=document.createElement("h2");h.className="created-server-voice-title";h.textContent=channel.name;createdServerMessages.append(h);const stage=document.createElement("div");stage.className="created-server-voice-stage";createdServerMessages.append(stage);const ah=document.createElement("h3");ah.className="created-server-audience-heading";ah.textContent="AUDIENCE";createdServerMessages.append(ah);const aud=document.createElement("div");aud.className="created-server-audience";createdServerMessages.append(aud);const ctl=document.createElement("div");ctl.className="created-server-voice-controls";const join=document.createElement("button");join.className="created-server-voice-join";join.textContent="Join Voice";join.onclick=()=>window.diamondJoinCreatedVoiceRoom?.(channel.name,"cs-"+activeCreatedServerId+"-"+channel.id);const leave=document.createElement("button");leave.className="created-server-voice-leave";leave.textContent="Leave";leave.onclick=()=>window.diamondLeaveVoice?.();ctl.append(join,leave);createdServerMessages.append(ctl);const note=document.createElement("p");note.className="created-server-voice-status";note.textContent="Connect your microphone to join. Members will appear here.";createdServerMessages.append(note);createdServerVoicePresenceStop?.();createdServerVoicePresenceStop=window.diamondWatchCreatedVoiceRoom?.("cs-"+activeCreatedServerId+"-"+channel.id,stage,aud)||null;}}
async function createCreatedServerChannel(typeOverride = null) {
    if (!currentUser || !activeCreatedServerId) return;
    if (!(await currentServerHasPermission("manageChannels"))) {
        alert("You need the Manage Channels role permission to create channels.");
        return;
    }
    const serverId = activeCreatedServerId;
    const nameInput = prompt(typeOverride === "category" ? "Enter the category name:" : "Enter the channel name:");
    if (nameInput === null) return;
    const name = nameInput.trim();
    if (name.length < 1 || name.length > 40) {
        alert("Names must be between 1 and 40 characters.");
        return;
    }

    let type = typeOverride;
    if (!type) {
        const typeInput = prompt("Enter channel type: text or voice", "text");
        if (typeInput === null) return;
        type = typeInput.trim().toLowerCase();
    }
    if (!["text", "voice", "category"].includes(type)) {
        alert("Channel type must be text or voice.");
        return;
    }

    const nameLower = name.toLowerCase();
    if (createdServerChannels.some(channel => channel.type === type &&
        String(channel.name || "").trim().toLowerCase() === nameLower)) {
        alert(`A ${type} with that name already exists.`);
        return;
    }

    let parentCategoryId = null;
    if (type === "text" || type === "voice") {
        const availableCategories = createdServerChannels.filter(c => c.type === "category");
        if (availableCategories.length) {
            const choices = availableCategories.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
            const answer = prompt(`Place this channel under a category by entering its number, or leave blank for no category:\n${choices}`, "");
            if (answer === null) return;
            if (answer.trim()) {
                const index = Number(answer) - 1;
                if (!Number.isInteger(index) || index < 0 || index >= availableCategories.length) {
                    alert("Choose a valid category number, or leave it blank.");
                    return;
                }
                parentCategoryId = availableCategories[index].id;
            }
        }
    }

    const buttons = [
        addServerChannelButton,
        document.getElementById("addServerTextChannelButton"),
        document.getElementById("addServerVoiceChannelButton")
    ].filter(Boolean);
    buttons.forEach(button => button.disabled = true);

    try {
        const channelsRef = collection(db, "servers", serverId, "channels");
        const channelData = {
            name, nameLower, type, createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        };
        if (parentCategoryId) channelData.parentCategoryId = parentCategoryId;
        const channelRef = await addDoc(channelsRef, channelData);
        if (activeCreatedServerId === serverId && type === "text") {
            openCreatedServerChannel({ id: channelRef.id, ...channelData, createdAt: null });
        }
    } catch (error) {
        console.error("Channel creation failed:", error);
        alert(error.code === "permission-denied"
            ? "Firebase denied channel creation. Check your Firestore rules."
            : "The channel could not be created.");
    } finally {
        buttons.forEach(button => button.disabled = false);
    }
}

addServerChannelButton?.addEventListener("click", () => void createCreatedServerChannel());
document.getElementById("addServerTextChannelButton")?.addEventListener("click", () => void createCreatedServerChannel("text"));
document.getElementById("addServerVoiceChannelButton")?.addEventListener("click", () => void createCreatedServerChannel("voice"));

document.querySelectorAll("[data-server-menu-action]").forEach(button => button.addEventListener("click", () => { const a=button.dataset.serverMenuAction; if(a==="channel")void createCreatedServerChannel(); if(a==="invite")void serverInviteDialog(); if(a==="settings")void serverSettingsDialog(); if(a==="members")void serverMembersDialog(); if(a==="roles")void serverRolesDialog(); if(a==="category")void createCreatedServerChannel("category"); if(a==="event")void serverEventsDialog(); }));
function serverFeatureDialog(title){let o=document.getElementById("serverFeatureDialog");if(!o){o=document.createElement("div");o.id="serverFeatureDialog";o.className="created-server-feature-backdrop";o.innerHTML='<section class="created-server-feature-modal"><button type="button" class="created-server-feature-close">×</button><h2></h2><div class="created-server-feature-content"></div></section>';document.body.append(o);o.querySelector("button").onclick=()=>o.remove();o.onclick=e=>{if(e.target===o)o.remove();};}o.querySelector("h2").textContent=title;const c=o.querySelector(".created-server-feature-content");c.replaceChildren();return c;}function sfNode(tag,t){const n=document.createElement(tag);n.textContent=t;return n;}
async function serverInviteDialog(channel=null){if(!currentUser||!activeCreatedServerId)return;const c=serverFeatureDialog("Invite Friends"),p=sfNode("p",channel?"Create a link to invite someone directly to this voice channel.":"Create a shareable invite link.");c.append(p);const b=sfNode("button","Create invite link");b.className="created-server-feature-action";c.append(b);const area=document.createElement("div");c.append(area);b.onclick=async()=>{try{b.disabled=true;const code=(crypto.randomUUID?.()||Date.now()+"-"+Math.random()).replace(/-/g,"").slice(0,20);await setDoc(doc(db,"servers",activeCreatedServerId,"invites",code),{code,createdBy:currentUser.uid,createdAt:serverTimestamp(),channelId:channel?.id||null});const url=new URL(location.href);url.searchParams.set("serverInvite",activeCreatedServerId);url.searchParams.set("invite",code);if(channel)url.searchParams.set("inviteChannel",channel.id);area.replaceChildren();const input=document.createElement("input");input.readOnly=true;input.value=url.href;const cp=sfNode("button","Copy");cp.className="created-server-feature-action";cp.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);cp.textContent="Copied";}catch{input.select();document.execCommand("copy");}};area.append(input,cp);}catch(e){console.error(e);alert("Invite link creation failed. Firebase permissions may need updating.");}finally{b.disabled=false;}};}
async function serverVoiceChannelSettings(channel){if(!currentUser||!activeCreatedServerId)return;const c=serverFeatureDialog("Voice Channel Settings");const label=sfNode("label","Channel name");const input=document.createElement("input");input.value=channel.name||"";input.maxLength=40;c.append(label,input);const save=sfNode("button","Save");save.className="created-server-feature-action";c.append(save);save.onclick=async()=>{try{await updateDoc(doc(db,"servers",activeCreatedServerId,"channels",channel.id),{name:input.value.trim(),nameLower:normalizeServerName(input.value)});channel.name=input.value.trim();renderCreatedServerChannels();if(activeCreatedServerChannelId===channel.id&&createdServerActiveChannel)createdServerActiveChannel.textContent=channel.name;save.textContent="Saved";}catch(e){alert("Channel update failed. Check Firebase rules.");}};if(currentServerCanManageChannels||activeCreatedServerOwnerUid===currentUser.uid){const del=sfNode("button","Delete channel");del.className="created-server-feature-action";del.style.background="#ed4245";c.append(del);del.onclick=()=>{if(confirm("Delete this voice channel?"))void deleteCreatedServerChannel(channel);};}}
async function openCreatedServerVoiceChat(channel){if(!currentUser||!activeCreatedServerId)return;const c=serverFeatureDialog(channel.name+" — Chat");c.className="created-server-feature-content created-server-voice-chat-content";const log=document.createElement("div");log.className="created-server-voice-chat-log";c.append(log);const form=document.createElement("form");form.className="created-server-voice-chat-form";const input=document.createElement("input");input.placeholder="Message #"+channel.name;input.maxLength=2000;input.required=true;const send=sfNode("button","Send");send.className="created-server-feature-action";form.append(input,send);c.append(form);const ref=collection(db,"servers",activeCreatedServerId,"channels",channel.id,"messages");const unsub=onSnapshot(query(ref,orderBy("timestamp","asc")),snap=>{log.replaceChildren();snap.forEach(d=>{const data=d.data(),row=document.createElement("div");row.className="created-server-voice-chat-message";const name=sfNode("strong",data.displayName||data.username||"Member");const body=sfNode("span",data.text||"");row.append(name,body);log.append(row);});log.scrollTop=log.scrollHeight;},e=>{console.error(e);log.textContent="Chat could not be loaded. Firebase rules may need updating.";});form.onsubmit=async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;send.disabled=true;try{await addDoc(ref,{uid:currentUser.uid,displayName:currentUser.displayName||currentUser.email?.split("@")[0]||"Member",text,timestamp:serverTimestamp()});input.value="";}catch(e){console.error(e);alert("Message failed to send. Firebase rules may need updating.");}finally{send.disabled=false;}};const modal=document.getElementById("serverFeatureDialog");modal?.querySelector(".created-server-feature-close")?.addEventListener("click",unsub,{once:true});modal?.addEventListener("DOMNodeRemoved",unsub,{once:true});}
async function serverSettingsDialog() {
    if (!activeCreatedServerId || !currentUser) return;
    const serverId = activeCreatedServerId;
    const snapshot = await getDoc(doc(db, "servers", serverId));
    if (!snapshot.exists()) return;

    const data = snapshot.data();
    const content = serverFeatureDialog("Server Settings");
    const nameInput = document.createElement("input");
    nameInput.value = data.name || "";
    nameInput.maxLength = 40;
    nameInput.placeholder = "Server name";

    const iconInput = document.createElement("input");
    iconInput.type = "url";
    iconInput.value = data.iconUrl || "";
    iconInput.placeholder = "Or paste an image URL";

    const iconFile = document.createElement("input");
    iconFile.type = "file";
    iconFile.accept = "image/png,image/jpeg,image/webp,image/gif";
    const iconPreview = document.createElement("img");
    iconPreview.alt = "Server icon preview";
    iconPreview.style.width = "64px";
    iconPreview.style.height = "64px";
    iconPreview.style.objectFit = "cover";
    iconPreview.style.borderRadius = "16px";
    iconPreview.style.display = data.iconUrl ? "block" : "none";
    if (data.iconUrl) iconPreview.src = data.iconUrl;

    iconFile.addEventListener("change", () => {
        const file = iconFile.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
            alert("Choose an image smaller than 5 MB.");
            iconFile.value = "";
            return;
        }
        iconPreview.src = URL.createObjectURL(file);
        iconPreview.style.display = "block";
    });

    const visibility = document.createElement("select");
    ["private", "public"].forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        visibility.append(option);
    });
    visibility.value = data.visibility || "private";

    content.append(
        sfNode("label", "Server name"), nameInput,
        sfNode("label", "Server icon"), iconPreview, iconFile,
        sfNode("label", "Or use an image URL"), iconInput,
        sfNode("label", "Visibility"), visibility
    );

    const save = sfNode("button", "Save changes");
    save.className = "created-server-feature-action";
    content.append(save);

    save.onclick = async () => {
        if (activeCreatedServerOwnerUid !== currentUser.uid) {
            alert("Only the owner can change settings.");
            return;
        }
        const name = nameInput.value.trim();
        let iconUrl = iconInput.value.trim();
        const file = iconFile.files?.[0];
        if (name.length < 2 || name.length > 40) {
            alert("Server name must be between 2 and 40 characters.");
            return;
        }
        if (iconUrl && !/^https?:\/\//i.test(iconUrl)) {
            alert("Server icon URL must start with http:// or https://.");
            return;
        }

        save.disabled = true;
        save.textContent = file ? "Uploading icon..." : "Saving...";
        try {
            if (file) {
                if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
                    throw new Error("Choose an image smaller than 5 MB.");
                }
                const extension = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
                const path = `uploads/${currentUser.uid}/server-${serverId}-${Date.now()}.${extension || "png"}`;
                const stored = await uploadBytes(storageRef(storage, path), file, {
                    contentType: file.type,
                    cacheControl: "public,max-age=31536000"
                });
                iconUrl = await getDownloadURL(stored.ref);
            }

            await updateDoc(doc(db, "servers", serverId), {
                name,
                nameLower: normalizeServerName(name),
                visibility: visibility.value,
                iconUrl
            });

            if (serverViewName) serverViewName.textContent = name;
            if (serverWelcomeName) serverWelcomeName.textContent = name;
            const menuName = document.getElementById("createdServerMenuName");
            if (menuName) menuName.textContent = name;
            await loadServerIcons();
            save.textContent = "Saved";
        } catch (error) {
            console.error("Server settings save failed:", error);
            alert(error.code === "permission-denied"
                ? "Firebase denied this change. Storage and Firestore rules may need to be published."
                : (error.message || "Settings save failed."));
            save.textContent = "Save changes";
        } finally {
            save.disabled = false;
        }
    };
}

async function serverMembersDialog() {
    if (!activeCreatedServerId) return;
    const serverId = activeCreatedServerId;
    const canManageMembers = activeCreatedServerOwnerUid === currentUser?.uid;
    const content = serverFeatureDialog("Server Members");
    content.textContent = "Loading members...";
    try {
        const serverSnapshot = await getDoc(doc(db, "servers", serverId));
        if (!serverSnapshot.exists()) {
            content.textContent = "This server no longer exists.";
            return;
        }
        const memberUids = serverSnapshot.data().memberUids || [];
        const roleSnapshot = await getDocs(collection(db, "servers", serverId, "roles"));
        const roles = roleSnapshot.docs
            .map(entry => ({ id: entry.id, ...entry.data() }))
            .filter(role => role.id !== "owner");
        content.replaceChildren();
        if (!memberUids.length) {
            content.append(sfNode("p", "No members found."));
            return;
        }

        const list = document.createElement("div");
        list.style.display = "flex";
        list.style.flexDirection = "column";
        list.style.gap = "10px";

        for (const uid of memberUids) {
            try {
                const [userSnapshot, memberSnapshot] = await Promise.all([
                    getDoc(doc(db, "users", uid)),
                    getDoc(doc(db, "servers", serverId, "members", uid))
                ]);
                const userData = userSnapshot.exists() ? userSnapshot.data() : {};
                const memberData = memberSnapshot.exists() ? memberSnapshot.data() : {};
                const row = document.createElement("section");
                row.style.padding = "12px";
                row.style.borderRadius = "9px";
                row.style.background = "#232428";
                const heading = sfNode("strong",
                    userData.displayName || userData.name ||
                    (uid === activeCreatedServerOwnerUid ? "Server Owner" : "Member"));
                if (uid === activeCreatedServerOwnerUid) heading.textContent += " · Owner";
                row.append(heading);

                if (canManageMembers && uid !== activeCreatedServerOwnerUid && memberSnapshot.exists()) {
                    const roleWrap = document.createElement("div");
                    roleWrap.style.display = "flex";
                    roleWrap.style.flexWrap = "wrap";
                    roleWrap.style.gap = "8px";
                    roleWrap.style.marginTop = "10px";
                    const selectedRoleIds = new Set(Array.isArray(memberData.roleIds) ? memberData.roleIds : ["member"]);
                    const checks = [];
                    roles.forEach(role => {
                        const label = document.createElement("label");
                        label.style.display = "inline-flex";
                        label.style.alignItems = "center";
                        label.style.gap = "5px";
                        const checkbox = document.createElement("input");
                        checkbox.type = "checkbox";
                        checkbox.checked = selectedRoleIds.has(role.id);
                        checkbox.style.width = "auto";
                        label.append(checkbox, document.createTextNode(role.name || role.id));
                        roleWrap.append(label);
                        checks.push({ role, checkbox });
                    });
                    const save = sfNode("button", "Save roles");
                    save.className = "created-server-feature-action";
                    save.style.marginTop = "10px";
                    const status = sfNode("span", "");
                    status.style.marginLeft = "10px";
                    save.onclick = async () => {
                        save.disabled = true;
                        try {
                            const roleIds = checks.filter(item => item.checkbox.checked).map(item => item.role.id);
                            const permissions = new Set();
                            checks.filter(item => item.checkbox.checked).forEach(item => {
                                (Array.isArray(item.role.permissions) ? item.role.permissions : [])
                                    .forEach(permission => permissions.add(permission));
                            });
                            const memberRef = doc(db, "servers", serverId, "members", uid);
                            const roleUpdate = { roleIds, permissions: [...permissions] };
                            if (memberSnapshot.exists()) {
                                await updateDoc(memberRef, roleUpdate);
                            } else {
                                await setDoc(memberRef, {
                                    uid,
                                    displayName: userData.displayName || userData.name || "Member",
                                    ...roleUpdate,
                                    joinedAt: serverTimestamp()
                                });
                            }
                            status.textContent = "Saved";
                        } catch (error) {
                            console.error("Member role assignment failed:", error);
                            status.textContent = "Could not save. Publish updated rules.";
                        } finally {
                            save.disabled = false;
                        }
                    };
                    row.append(roleWrap, save, status);
                } else if (uid !== activeCreatedServerOwnerUid) {
                    const assigned = (memberData.roleIds || [])
                        .map(id => roles.find(role => role.id === id)?.name || id);
                    row.append(sfNode("p", assigned.length ? assigned.join(", ") : "Member"));
                }
                list.append(row);
            } catch (memberError) {
                console.warn("Member profile unavailable:", memberError);
                list.append(sfNode("div", uid === activeCreatedServerOwnerUid ? "Server Owner" : "Member"));
            }
        }
        content.append(list);
    } catch (error) {
        console.error("Server member list failed:", error);
        content.textContent = "Members could not be loaded. Firebase permissions may need updating.";
    }
}

async function serverRolesDialog() {
    if (!activeCreatedServerId || !currentUser) return;
    if (activeCreatedServerOwnerUid !== currentUser.uid) {
        alert("Only the server owner can manage roles.");
        return;
    }

    const serverId = activeCreatedServerId;
    const content = serverFeatureDialog("Server Roles & Permissions");
    content.append(sfNode("p", "Create roles, choose their permissions, then assign them from Server Members."));

    const nameInput = document.createElement("input");
    nameInput.placeholder = "Role name";
    nameInput.maxLength = 30;
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = "#c7a96b";
    const permissionsBox = document.createElement("div");
    permissionsBox.style.display = "grid";
    permissionsBox.style.gridTemplateColumns = "repeat(auto-fit,minmax(170px,1fr))";
    permissionsBox.style.gap = "8px";
    const permissionChecks = new Map();
    SERVER_PERMISSION_OPTIONS.forEach(([value, labelText]) => {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "7px";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = value;
        checkbox.style.width = "auto";
        label.append(checkbox, document.createTextNode(labelText));
        permissionsBox.append(label);
        permissionChecks.set(value, checkbox);
    });

    const save = sfNode("button", "Create role");
    save.className = "created-server-feature-action";
    const cancel = sfNode("button", "Cancel edit");
    cancel.className = "created-server-feature-action";
    cancel.hidden = true;
    const status = sfNode("span", "");
    let editingRoleId = null;

    const resetForm = () => {
        editingRoleId = null;
        nameInput.value = "";
        colorInput.value = "#c7a96b";
        permissionChecks.forEach(checkbox => checkbox.checked = false);
        save.textContent = "Create role";
        cancel.hidden = true;
    };
    cancel.onclick = resetForm;
    save.onclick = async () => {
        const name = nameInput.value.trim();
        if (name.length < 2 || name.length > 30) {
            alert("Role names must be between 2 and 30 characters.");
            return;
        }
        const permissions = [...permissionChecks.entries()]
            .filter(([, checkbox]) => checkbox.checked)
            .map(([value]) => value);
        save.disabled = true;
        try {
            const roleData = {
                name,
                nameLower: name.toLowerCase(),
                color: colorInput.value,
                permissions,
                managed: false,
                updatedAt: serverTimestamp()
            };
            if (editingRoleId) {
                await updateDoc(doc(db, "servers", serverId, "roles", editingRoleId), roleData);
                status.textContent = "Role updated.";
            } else {
                await addDoc(collection(db, "servers", serverId, "roles"), {
                    ...roleData, createdBy: currentUser.uid, createdAt: serverTimestamp()
                });
                status.textContent = "Role created.";
            }
            await refreshServerMemberPermissions(serverId);
            resetForm();
            await renderRoles();
        } catch (error) {
            console.error("Role save failed:", error);
            status.textContent = error.code === "permission-denied"
                ? "Firebase denied this change. Publish updated rules."
                : "Role could not be saved.";
        } finally {
            save.disabled = false;
        }
    };

    content.append(sfNode("label", "Role name"), nameInput,
        sfNode("label", "Role color"), colorInput,
        sfNode("h3", "Permissions"), permissionsBox, save, cancel, status);
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "8px";
    content.append(sfNode("h3", "Existing roles"), list);

    async function renderRoles() {
        const snapshot = await getDocs(collection(db, "servers", serverId, "roles"));
        list.replaceChildren();
        const entries = snapshot.docs
            .map(entry => ({ id: entry.id, ...entry.data() }))
            .sort((a, b) => (b.position || 0) - (a.position || 0));
        entries.forEach(role => {
            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.flexWrap = "wrap";
            row.style.gap = "8px";
            row.style.padding = "10px";
            row.style.background = "#232428";
            row.style.borderRadius = "8px";
            const dot = document.createElement("span");
            dot.style.width = "10px";
            dot.style.height = "10px";
            dot.style.borderRadius = "50%";
            dot.style.background = role.color || "#c7a96b";
            const label = sfNode("strong", role.name || role.id);
            row.append(dot, label, sfNode("span", (role.permissions || []).join(", ") || "No extra permissions"));
            if (role.id !== "owner" && !role.managed) {
                const edit = sfNode("button", "Edit");
                edit.className = "created-server-feature-action";
                edit.onclick = () => {
                    editingRoleId = role.id;
                    nameInput.value = role.name || "";
                    colorInput.value = role.color || "#c7a96b";
                    permissionChecks.forEach((checkbox, permission) => {
                        checkbox.checked = (role.permissions || []).includes(permission);
                    });
                    save.textContent = "Save role";
                    cancel.hidden = false;
                    nameInput.focus();
                };
                const remove = sfNode("button", "Delete");
                remove.className = "created-server-feature-action";
                remove.style.background = "#7c3438";
                remove.onclick = async () => {
                    if (!confirm(`Delete the ${role.name || "selected"} role?`)) return;
                    remove.disabled = true;
                    try {
                        const serverSnapshot = await getDoc(doc(db, "servers", serverId));
                        const uids = serverSnapshot.data()?.memberUids || [];
                        await Promise.all(uids.map(async uid => {
                            const memberRef = doc(db, "servers", serverId, "members", uid);
                            const memberSnapshot = await getDoc(memberRef);
                            if (!memberSnapshot.exists()) return;
                            const memberData = memberSnapshot.data();
                            const roleIds = (memberData.roleIds || []).filter(id => id !== role.id);
                            await updateDoc(memberRef, { roleIds });
                        }));
                        await deleteDoc(doc(db, "servers", serverId, "roles", role.id));
                        await refreshServerMemberPermissions(serverId);
                        if (editingRoleId === role.id) resetForm();
                        await renderRoles();
                    } catch (error) {
                        console.error("Role delete failed:", error);
                        alert("Role could not be deleted. Check the latest Firebase rules.");
                    } finally {
                        remove.disabled = false;
                    }
                };
                row.append(edit, remove);
            } else {
                row.append(sfNode("span", "Built-in owner role"));
            }
            list.append(row);
        });
    }

    await renderRoles();
}

async function serverEventsDialog() {
    if (!activeCreatedServerId || !currentUser) return;
    const serverId = activeCreatedServerId;
    const content = serverFeatureDialog("Server Events");
    content.append(sfNode("p", "Create and view community events."));
    const title = document.createElement("input");
    title.placeholder = "Event name";
    title.maxLength = 80;
    title.required = true;
    const date = document.createElement("input");
    date.type = "datetime-local";
    const details = document.createElement("textarea");
    details.placeholder = "Event details (optional)";
    details.maxLength = 1000;
    details.rows = 3;
    const create = sfNode("button", "Create event");
    create.className = "created-server-feature-action";
    content.append(title, date, details, create);
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "8px";
    content.append(sfNode("h3", "Upcoming / recent events"), list);
    const eventRef = collection(db, "servers", serverId, "events");
    const unsub = onSnapshot(query(eventRef, orderBy("createdAt", "desc"), limit(20)), snap => {
        list.replaceChildren();
        if (snap.empty) list.append(sfNode("p", "No events yet."));
        snap.forEach(entry => {
            const data = entry.data();
            const card = document.createElement("div");
            card.style.padding = "12px";
            card.style.background = "#232428";
            card.style.borderRadius = "8px";
            card.append(sfNode("strong", data.title || "Event"), sfNode("p", data.startsAt || "Time not set"), sfNode("p", data.details || ""));
            list.append(card);
        });
    }, error => { console.error("Event listener failed:", error); list.textContent = "Events unavailable. Firebase permissions may need updating."; });
    create.onclick = async () => {
        if (!(await currentServerHasPermission("manageEvents"))) {
            alert("You need the Manage Events role permission to create events.");
            return;
        }
        const eventName = title.value.trim();
        if (!eventName) { title.focus(); return; }
        create.disabled = true;
        try {
            await addDoc(eventRef, { title: eventName, startsAt: date.value || "Time not set", details: details.value.trim(), createdBy: currentUser.uid, createdAt: serverTimestamp() });
            title.value = ""; date.value = ""; details.value = "";
        } catch (error) { console.error("Event creation failed:", error); alert("Event creation failed. Firebase permissions may need updating."); }
        finally { create.disabled = false; }
    };
    document.getElementById("serverFeatureDialog")?.querySelector(".created-server-feature-close")?.addEventListener("click", unsub, { once: true });
}

function openServer(server) {
    if (!server?.id) return;

    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    selectedMember = null;
    currentConversationId = null;
    activeCreatedServerId = server.id;
activeCreatedServerOwnerUid = server.ownerUid || null;
currentServerCanManageChannels = activeCreatedServerOwnerUid === currentUser?.uid;
if (!currentServerCanManageChannels) {
    const permissionServerId = server.id;
    void currentServerHasPermission("manageChannels").then(granted => {
        if (activeCreatedServerId === permissionServerId && granted) {
            currentServerCanManageChannels = true;
            renderCreatedServerChannels();
        }
    });
}
activeCreatedServerChannelId = null;
activeCreatedServerChannelType = "text";

loadCreatedServerChannels(server.id);

    // Hide the VIP-LOUNGE and DM sidebars.
    if (loungeSidebar) loungeSidebar.hidden = true;
    if (dmSidebar) dmSidebar.hidden = true;
    if (communitySidebar) communitySidebar.hidden = true;

    hideMainViews();

    if (serverView) serverView.hidden = false;
    if (serverViewName) serverViewName.textContent = server.name;
    if (serverWelcomeName) serverWelcomeName.textContent = server.name;
    const menuName = document.getElementById("createdServerMenuName");
    if (menuName) menuName.textContent = server.name;

    if (serverViewVisibility) {
        serverViewVisibility.textContent =
            server.visibility === "public"
                ? "Public server — anyone can join"
                : "Private server — invite only";
    }

    document.body.classList.remove("dm-mode");

    if (mainServerButton) {
        mainServerButton.classList.remove("selected");
        mainServerButton.setAttribute("aria-pressed", "false");
    }

    if (dmHomeButton) {
        dmHomeButton.classList.remove("selected");
        dmHomeButton.setAttribute("aria-pressed", "false");
    }

    clearServerSelections();

    const serverButton = server.button ||
        [...(createdServers?.querySelectorAll(".created-server") || [])]
            .find(button => button.dataset.serverId === server.id);
    serverButton?.classList.add("selected");
    serverButton?.setAttribute("aria-pressed", "true");

    setMobileSidebar(false);
}

function closeServerContextMenu() {
    serverContextMenu?.remove();
    serverContextMenu = null;
}

function showServerContextMenu(event, server) {
    if (
        !server?.id ||
        !currentUser ||
        server.ownerUid !== currentUser.uid
    ) return;

    event.preventDefault();
    closeServerContextMenu();

    const menu = document.createElement("div");
    menu.className = "server-context-menu";
    menu.setAttribute("role", "menu");

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "server-context-delete";
    deleteButton.setAttribute("role", "menuitem");
    deleteButton.textContent = "Delete Server";

    deleteButton.addEventListener("click", () => {
        closeServerContextMenu();
        void deleteServer(server);
    });

    menu.appendChild(deleteButton);

    menu.style.left = `${Math.max(
        8,
        Math.min(event.clientX, window.innerWidth - 180)
    )}px`;

    menu.style.top = `${Math.max(
        8,
        Math.min(event.clientY, window.innerHeight - 55)
    )}px`;

    document.body.appendChild(menu);
    serverContextMenu = menu;

    document.addEventListener("click", closeServerContextMenu, {
        once: true
    });
}

async function deleteServer(server) {
    if (
        !server?.id ||
        !currentUser ||
        server.ownerUid !== currentUser.uid
    ) return;

    try {
        await deleteDoc(doc(db, "servers", server.id));
        server.button?.remove();

        if (activeCreatedServerId === server.id) {
            activeCreatedServerId = null;

            stopPublicMessages();
            stopDirectMessages();

            showLoungeSidebar();
            showEmptyView();
            clearServerSelections();

            if (mainServerButton) {
                mainServerButton.classList.add("selected");
                mainServerButton.setAttribute("aria-pressed", "true");
            }
        }
    } catch (error) {
        console.error("Server deletion failed:", error);

        alert(
            error.code === "permission-denied"
                ? "Firebase denied deletion. Check the server owner delete rule."
                : "The server could not be deleted. Please try again."
        );
    }
}

function makeServerIcon(server) {
    const icon = document.createElement("button");

    icon.type = "button";
    icon.className = "server-icon created-server";
    icon.title = server.name;
    icon.dataset.serverId = server.id;
    icon.setAttribute("aria-label", `Open ${server.name}`);
    icon.setAttribute("aria-pressed", "false");
    if (typeof server.iconUrl === "string" && (server.iconUrl.startsWith("https://") || server.iconUrl.startsWith("http://"))) { const img=document.createElement("img"); img.src=server.iconUrl; img.alt=""; img.style.width="100%"; img.style.height="100%"; img.style.objectFit="cover"; img.style.borderRadius="inherit"; icon.append(img); } else { icon.textContent = server.name.trim().charAt(0).toUpperCase(); }

    server.button = icon;

    icon.addEventListener("click", (event) => {
        if (suppressServerClick) {
            event.preventDefault();
            event.stopPropagation();
            suppressServerClick = false;
            return;
        }

        openServer(server);
    });

    // COMPUTER RIGHT-CLICK
    icon.addEventListener("contextmenu", (event) => {
        showServerContextMenu(event, server);
    });

    // MOBILE LONG-PRESS
    icon.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch") return;

        clearTimeout(serverLongPressTimer);
        suppressServerClick = false;

        serverLongPressTimer = setTimeout(() => {
            suppressServerClick = true;

            showServerContextMenu(
                {
                    preventDefault() {},
                    clientX: event.clientX,
                    clientY: event.clientY
                },
                server
            );
        }, 650);
    });

    icon.addEventListener("pointerup", () => {
        clearTimeout(serverLongPressTimer);
    });

    icon.addEventListener("pointercancel", () => {
        clearTimeout(serverLongPressTimer);
    });

    icon.addEventListener("pointerleave", () => {
        clearTimeout(serverLongPressTimer);
    });

    return icon;
}
// Load saved servers while hiding the old THEAGENTS server.
async function loadServerIcons() {
    if (!currentUser || !createdServers) return;

    try {
        const snapshot = await getDocs(
            query(
                collection(db, "servers"),
                where("memberUids", "array-contains", currentUser.uid)
            )
        );

        const savedServers = snapshot.docs
            .map((entry) => {
                const data = entry.data();

                return {
                    id: entry.id,
                    name:
                        typeof data.name === "string" && data.name.trim()
                            ? data.name.trim()
                            : "Server",
                    visibility: data.visibility || "private",
                    iconUrl: typeof data.iconUrl === "string" ? data.iconUrl : "",
                    ownerUid: data.ownerUid || "",
                    createdAt: data.createdAt || null
                };
            })
            .filter((server) => {
                const normalizedName = normalizeServerName(server.name);

                return (
                    normalizedName !== "vip-lounge" &&
                    normalizedName !== normalizeServerName("💎THEAGENTS🤍")
                );
            });

        savedServers.sort((a, b) => {
            const aOwned = a.ownerUid === currentUser.uid ? 1 : 0;
            const bOwned = b.ownerUid === currentUser.uid ? 1 : 0;

            if (aOwned !== bOwned) {
                return bOwned - aOwned;
            }

            const aTime =
                a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

            const bTime =
                b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

            return aTime - bTime;
        });

        createdServers.replaceChildren();

        const displayedNames = new Set();

        savedServers.forEach((server) => {
            const normalizedName = normalizeServerName(server.name);

            if (!normalizedName || displayedNames.has(normalizedName)) {
                return;
            }

            displayedNames.add(normalizedName);
            const button = makeServerIcon(server);
            if (activeCreatedServerId === server.id) {
                button.classList.add("selected");
                button.setAttribute("aria-pressed", "true");
            }
            createdServers.appendChild(button);
        });
    } catch (error) {
        console.warn("Saved servers could not be listed:", error);
    }
}

// ==================================================
// LOGOUT
// ==================================================

async function logoutUser() {
    try {
        setMobileSidebar(false);
        closeServerContextMenu();

        stopPublicMessages();
        stopDirectMessages();
        stopMemberListener();

        if (window.leaveVoiceChat) {
            await window.leaveVoiceChat();
        }

        await signOut(auth);
        window.location.replace("login.html");
    } catch (error) {
        console.error("Logout failed:", error);
        alert("Unable to log out. Please try again.");
    }
}

logoutButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void logoutUser();
});

// ==================================================
// PROFILE AVATARS AND PROFILE EDITOR
// ==================================================

const AVATAR_STYLES = {
    diamond: {
        background: "linear-gradient(145deg,#2b2924,#141416)",
        color: "#e1c98f",
        glyph: "\u2726"
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

function avatarStyleFor(key) {
    return AVATAR_STYLES[key] || AVATAR_STYLES.diamond;
}

function applyAvatar(key) {
    currentAvatar = AVATAR_STYLES[key] ? key : "diamond";
    const style = avatarStyleFor(currentAvatar);

    if (uploadedPicture) {
        if (myProfilePicture) {
            myProfilePicture.style.background = "transparent";
            myProfilePicture.style.backgroundImage =
                `url("${uploadedPicture}")`;
            myProfilePicture.style.backgroundSize = "cover";
            myProfilePicture.style.backgroundPosition = "center";
            myProfilePicture.style.color = "transparent";
            myProfilePicture.textContent = "";
        }

        if (profilePreviewImage) {
            profilePreviewImage.src = uploadedPicture;
            profilePreviewImage.alt = "Your profile picture";
            profilePreviewImage.style.display = "block";
            profilePreviewImage.style.background = "transparent";
            profilePreviewImage.style.objectFit = "cover";
        }

        profileChoiceButtons.forEach((button) => {
            button.classList.remove("selected");
        });

        return;
    }

    if (myProfilePicture) {
        myProfilePicture.style.backgroundImage = "none";
        myProfilePicture.style.background = style.background;
        myProfilePicture.style.color = style.color;
        myProfilePicture.textContent =
            currentAvatar === "diamond" ? "\u2726" : style.glyph;
    }

    if (profilePreviewImage) {
        profilePreviewImage.removeAttribute("src");
        profilePreviewImage.alt = `${currentAvatar} avatar`;
        profilePreviewImage.style.display = "block";
        profilePreviewImage.style.background = style.background;
        profilePreviewImage.style.objectFit = "contain";
    }

    profileChoiceButtons.forEach((button) => {
        button.classList.toggle(
            "selected",
            button.dataset.avatar === currentAvatar
        );
    });
}

async function loadProfile() {
    if (!currentUser) return;

    try {
        const snapshot = await getDoc(doc(db, "users", currentUser.uid));
        const data = snapshot.exists() ? snapshot.data() : {};

        if (typeof data.displayName === "string" && data.displayName) {
            if (profileName) {
                profileName.textContent = data.displayName;
            }

            const currentName = currentUserElement?.querySelector("span");

            if (currentName) {
                currentName.textContent = data.displayName;
            }
        }

        uploadedPicture =
            typeof data.picture === "string" ? data.picture : "";

        applyAvatar(
            typeof data.avatar === "string" ? data.avatar : "diamond"
        );
    } catch (error) {
        console.warn("Profile could not be read:", error);

        uploadedPicture = "";
        applyAvatar("diamond");
    }
}

function openProfileModal() {
    if (!profileModal || !currentUser) return;

    if (profileDisplayName) {
        profileDisplayName.value =
            profileName?.textContent?.trim() || "Member";
    }

    if (profileStatus) {
        profileStatus.textContent = "";
        profileStatus.className = "";
    }

    rawPicture = "";

    if (profileCrop) {
        profileCrop.hidden = true;
    }

    if (profileUploadInput) {
        profileUploadInput.value = "";
    }

    applyAvatar(currentAvatar);

    profileModal.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(() => profileDisplayName?.focus());
}

function closeProfileModal() {
    if (!profileModal || profileModal.hidden) return;

    profileModal.hidden = true;
    document.body.classList.remove("modal-open");

    if (profileStatus) {
        profileStatus.textContent = "";
    }

    rawPicture = "";

    if (profileCrop) {
        profileCrop.hidden = true;
    }
}

profileButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openProfileModal();
});

closeProfileModalButton?.addEventListener("click", closeProfileModal);
cancelProfileEdit?.addEventListener("click", closeProfileModal);

profileModal?.addEventListener("click", (event) => {
    if (event.target === profileModal) {
        closeProfileModal();
    }
});

// ==================================================
// PROFILE IMAGE CROPPING AND UPLOAD
// ==================================================

function applyCropTransform() {
    if (!cropImage) return;

    cropImage.style.transformOrigin = "center center";
    cropImage.style.transform =
        `translate(${cropX}px, ${cropY}px) scale(${cropScale})`;
}

cropZoom?.addEventListener("input", () => {
    cropScale = Number(cropZoom.value) / 100;
    applyCropTransform();
});

cropImage?.addEventListener("pointerdown", (event) => {
    dragging = true;

    dragStartX = event.clientX - cropX;
    dragStartY = event.clientY - cropY;

    cropImage.setPointerCapture(event.pointerId);
});

cropImage?.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    cropX = event.clientX - dragStartX;
    cropY = event.clientY - dragStartY;

    applyCropTransform();
});

["pointerup", "pointercancel"].forEach((type) => {
    cropImage?.addEventListener(type, () => {
        dragging = false;
    });
});

function renderCroppedPicture() {
    return new Promise((resolve, reject) => {
        if (!rawPicture) {
            resolve("");
            return;
        }

        const image = new Image();

        image.onload = () => {
            const SIZE = 192;
            const FRAME = 160;

            const canvas = document.createElement("canvas");
            canvas.width = SIZE;
            canvas.height = SIZE;

            const ctx = canvas.getContext("2d");

            if (!ctx) {
                reject(new Error("Could not create the image crop."));
                return;
            }

            const ratio = SIZE / FRAME;

            const baseScale = Math.max(
                FRAME / image.width,
                FRAME / image.height
            );

            const scale = baseScale * cropScale * ratio;
            const drawW = image.width * scale;
            const drawH = image.height * scale;

            const dx = SIZE / 2 - drawW / 2 + cropX * ratio;
            const dy = SIZE / 2 - drawH / 2 + cropY * ratio;

            ctx.drawImage(image, dx, dy, drawW, drawH);

            try {
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            } catch (error) {
                reject(error);
            }
        };

        image.onerror = () => {
            reject(new Error("The selected image could not be loaded."));
        };

        image.src = rawPicture;
    });
}

profileChoiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
        uploadedPicture = "";
        rawPicture = "";

        if (profileUploadInput) {
            profileUploadInput.value = "";
        }

        if (profileCrop) {
            profileCrop.hidden = true;
        }

        applyAvatar(button.dataset.avatar);
    });
});

profileUploadInput?.addEventListener("change", () => {
    const file = profileUploadInput.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        if (profileStatus) {
            profileStatus.textContent = "Choose an image file.";
            profileStatus.className = "error";
        }

        profileUploadInput.value = "";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        if (profileStatus) {
            profileStatus.textContent =
                "Please choose an image smaller than 5 MB.";
            profileStatus.className = "error";
        }

        profileUploadInput.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        rawPicture = String(reader.result || "");

        cropScale = 1;
        cropX = 0;
        cropY = 0;

        if (profileCrop) {
            profileCrop.hidden = false;
        }

        if (cropZoom) {
            cropZoom.value = "100";
        }

        if (cropImage) {
            cropImage.src = rawPicture;
            cropImage.style.transformOrigin = "center center";
            cropImage.style.transform = "translate(0px, 0px) scale(1)";
        }

        if (profileStatus) {
            profileStatus.textContent =
                "Drag the image to position it. Adjust the zoom, then save.";
            profileStatus.className = "success";
        }
    };

    reader.onerror = () => {
        if (profileStatus) {
            profileStatus.textContent = "The image could not be opened.";
            profileStatus.className = "error";
        }
    };

    reader.readAsDataURL(file);
});

// ==================================================
// SAVE PROFILE
// ==================================================

profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) return;

    const nextName = (profileDisplayName?.value || "").trim().slice(0, 30);

    if (nextName.length < 2) {
        if (profileStatus) {
            profileStatus.textContent =
                "Display names need at least 2 characters.";
            profileStatus.className = "error";
        }

        return;
    }

    const saveButton = document.getElementById("saveProfileButton");

    if (saveButton) {
        saveButton.disabled = true;
    }

    try {
        if (rawPicture) {
            const croppedPicture = await renderCroppedPicture();

            if (!croppedPicture) {
                throw new Error("The selected picture could not be cropped.");
            }

            uploadedPicture = croppedPicture;
        }

        if (uploadedPicture.length > 400000) {
            throw new Error(
                "The cropped picture is too large. Please choose another image."
            );
        }

        await setDoc(
            doc(db, "users", currentUser.uid),
            {
                uid: currentUser.uid,
                displayName: nextName,
                avatar: currentAvatar,
                picture: uploadedPicture,
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );

        if (profileName) {
            profileName.textContent = nextName;
        }

        const currentName = currentUserElement?.querySelector("span");

        if (currentName) {
            currentName.textContent = nextName;
        }

        applyAvatar(currentAvatar);

        if (profileStatus) {
            profileStatus.textContent = "Profile saved successfully.";
            profileStatus.className = "success";
        }

        window.setTimeout(closeProfileModal, 700);
    } catch (error) {
        console.error("Profile save failed:", error);

        if (profileStatus) {
            profileStatus.textContent =
                error.code === "permission-denied"
                    ? "Firestore rejected the profile update. Check your users rules."
                    : error.message || "Your profile could not be saved.";

            profileStatus.className = "error";
        }
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
});

// ==================================================
// KEYBOARD SHORTCUTS AND CLEANUP
// ==================================================

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setMobileSidebar(false);
        closeServerModal();
        closeProfileModal();
        closeServerContextMenu();
    }
});

window.logout = logoutUser;
window.sendMessage = sendMessage;

window.clearChat = () => {
    alert("Shared lounge messages cannot be cleared here.");
};

window.addEventListener("pagehide", () => {
    closeServerContextMenu();

    stopPublicMessages();
    stopDirectMessages();
    stopMemberListener();
});
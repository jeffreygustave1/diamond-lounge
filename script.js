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
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
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

    activeCreatedServerChannelId = null;
    activeCreatedServerChannelType = "text";
    createdServerChannels = [];
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

    // Start with no server or channel selected.
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
});

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
            "manageServer",
            "manageChannels",
            "manageRoles",
            "manageMembers",
            "manageMessages",
            "kickMembers",
            "banMembers",
            "manageInvites",
            "manageVoice"
        ],
        position: 80,
        managed: false,
        createdAt: serverTimestamp()
    }),

    setDoc(doc(serverRolesRef, "moderator"), {
        name: "Moderator",
        nameLower: "moderator",
        permissions: [
            "manageMessages",
            "kickMembers",
            "manageVoice"
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

            const selectedChannel = createdServerChannels.find(
    (channel) =>
        channel.id === activeCreatedServerChannelId &&
        channel.type === activeCreatedServerChannelType
);

if (selectedChannel) {
    renderCreatedServerChannels();
    return;
}

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

    const textChannels = createdServerChannels.filter(
        (channel) => channel.type === "text"
    );

    const voiceChannels = createdServerChannels.filter(
        (channel) => channel.type === "voice"
    );

    function createChannelButton(channel) {
    const item = document.createElement("li");
    item.className = "created-server-channel-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "created-server-channel-button";
    button.dataset.channelId = channel.id;

    const symbol = document.createElement("span");
    symbol.className = "created-server-channel-icon";
    symbol.textContent = channel.type === "voice" ? "◖" : "#";

    const name = document.createElement("span");
    name.textContent = channel.name;

    button.append(symbol, name);

    const selected =
        channel.id === activeCreatedServerChannelId &&
        channel.type === activeCreatedServerChannelType;

    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));

    button.addEventListener("click", () => {
        if (channel.type === "text") {
            openCreatedServerChannel(channel);
        } else {
            openCreatedServerVoiceChannel(channel);
        }
    });

    item.appendChild(button);

    // CHANNEL DELETE BUTTON — SERVER OWNER ONLY
    if (activeCreatedServerOwnerUid === currentUser?.uid) {
        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.className = "created-server-channel-delete";
        deleteButton.textContent = "×";
        deleteButton.title = "Delete channel";
        deleteButton.setAttribute("aria-label", `Delete ${channel.name}`);

        deleteButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void deleteCreatedServerChannel(channel);
        });

        item.appendChild(deleteButton);
    }

    return item;
}

// ==================================================
// OPEN CREATED SERVER TEXT CHANNEL
// ==================================================

function openCreatedServerChannel(channel) {
    if (!currentUser || !activeCreatedServerId || !channel?.id) return;

    if (channel.type !== "text") return;

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

function openCreatedServerVoiceChannel(channel) {
    if (!channel?.id || !activeCreatedServerId) return;

    stopCreatedServerMessages();

    activeCreatedServerChannelId = channel.id;
    activeCreatedServerChannelType = "voice";

    if (createdServerActiveChannel) {
        createdServerActiveChannel.textContent = channel.name;
    }

    if (createdServerChannelSymbol) {
        createdServerChannelSymbol.textContent = "◖";
    }

    if (createdServerMessageInput) {
        createdServerMessageInput.disabled = true;
        createdServerMessageInput.placeholder =
            "Voice channels do not support text messages.";
    }

    if (createdServerSendButton) {
        createdServerSendButton.disabled = true;
    }

    renderCreatedServerChannels();

    if (createdServerMessages) {
        createdServerMessages.replaceChildren();

        const notice = document.createElement("div");
        notice.className = "channel-empty";
        notice.textContent =
            `Voice channel "${channel.name}" selected. Voice connection integration will be added next.`;

        createdServerMessages.appendChild(notice);
    }
}

// ==================================================
// CREATE CHANNEL
// ==================================================

addServerChannelButton?.addEventListener("click", async () => {
    if (!currentUser || !activeCreatedServerId) return;

    const serverId = activeCreatedServerId;

    const nameInput = prompt(
        "Enter the channel name:"
    );

    if (nameInput === null) return;

    const name = nameInput.trim();

    if (name.length < 1 || name.length > 40) {
        alert("Channel names must be between 1 and 40 characters.");
        return;
    }

    const typeInput = prompt(
        "Enter channel type: text or voice",
        "text"
    );

    if (typeInput === null) return;

    const type = typeInput.trim().toLowerCase();

    if (!["text", "voice"].includes(type)) {
        alert("Channel type must be text or voice.");
        return;
    }

    const nameLower = name.toLowerCase();

    const duplicate = createdServerChannels.some(
        (channel) =>
            channel.type === type &&
            String(channel.name || "").trim().toLowerCase() === nameLower
    );

    if (duplicate) {
        alert(`A ${type} channel with that name already exists.`);
        return;
    }

    addServerChannelButton.disabled = true;

    try {
        const channelsRef = collection(
            db,
            "servers",
            serverId,
            "channels"
        );

        const channelRef = await addDoc(channelsRef, {
            name,
            nameLower,
            type,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        });

        if (
            type === "text" &&
            activeCreatedServerId === serverId
        ) {
            openCreatedServerChannel({
                id: channelRef.id,
                name,
                nameLower,
                type
            });
        }
    } catch (error) {
        console.error("Channel creation failed:", error);

        alert(
            error.code === "permission-denied"
                ? "Firebase denied channel creation. Check your Firestore rules."
                : "The channel could not be created."
        );
    } finally {
        addServerChannelButton.disabled = false;
    }
});
// ==================================================
// OPEN, SELECT, AND DELETE CREATED SERVERS
// ==================================================

function openServer(server) {
    if (!server?.id) return;

    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    selectedMember = null;
    currentConversationId = null;
    activeCreatedServerId = server.id;
activeCreatedServerOwnerUid = server.ownerUid || null;
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

    server.button?.classList.add("selected");
    server.button?.setAttribute("aria-pressed", "true");

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
    icon.textContent = server.name.trim().charAt(0).toUpperCase();

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
            createdServers.appendChild(makeServerIcon(server));
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
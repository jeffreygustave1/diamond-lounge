
import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
    addDoc,
    collection,
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

const messagesElement = document.getElementById("messages");
const input = document.getElementById("messageInput");
const messageForm = document.getElementById("messageForm");
const sendButton = document.getElementById("sendMessageButton");
const activeChannelName = document.getElementById("activeChannelName");
const activeChannelDescription = document.getElementById("activeChannelDescription");
const textChannelButtons = [...document.querySelectorAll(".text-channel")];

// Fix the workspace decoration intercepting clicks on text channels.
function disableWorkspaceGemOverlay() {
    document.querySelectorAll(".workspace-gem").forEach((gem) => {
        gem.style.setProperty("pointer-events", "none", "important");
    });
}

disableWorkspaceGemOverlay();

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

const channelDescriptions = {
    general: "A little space to share what matters.",
    announcements: "Important Diamond Lounge news and updates.",
    streaming: "Share streams, clips, schedules, and creator updates."
};

let currentUser = null;
let activeTextChannel = null;
let stopMessagesListener = null;
let stopMembersListener = null;
let stopDirectMessagesListener = null;
let members = [];
let selectedMember = null;
let currentConversationId = null;

function setMobileSidebar(open) {
    if (!dashboard) return;
    dashboard.classList.toggle("mobile-nav-open", open);
    mobileMenuButtons.forEach((button) => {
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    });
}

mobileMenuButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setMobileSidebar(!dashboard?.classList.contains("mobile-nav-open"));
    });
});

mobileSidebarBackdrop?.addEventListener("click", () => setMobileSidebar(false));

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setMobileSidebar(false);
        closeServerModal();
    }
});

function stopPublicMessages() {
    stopMessagesListener?.();
    stopMessagesListener = null;
}

function stopDirectMessages() {
    stopDirectMessagesListener?.();
    stopDirectMessagesListener = null;
}

function hideMainViews() {
    if (emptyView) emptyView.hidden = true;
    if (serverView) serverView.hidden = true;
    if (loungeView) loungeView.hidden = true;
    if (dmHomeView) dmHomeView.hidden = true;
    if (dmConversationView) dmConversationView.hidden = true;
}

function showLoungeSidebar() {
    if (dmSidebar) dmSidebar.hidden = true;
    if (loungeSidebar) loungeSidebar.hidden = false;
    dmHomeButton?.classList.remove("selected");
    dmHomeButton?.setAttribute("aria-pressed", "false");
    mainServerButton?.classList.add("selected");
    mainServerButton?.setAttribute("aria-pressed", "true");
    document.body.classList.remove("dm-mode");
}

function showEmptyView() {
    stopPublicMessages();
    activeTextChannel = null;
    hideMainViews();
    if (emptyView) emptyView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = true;

    textChannelButtons.forEach((button) => {
        button.classList.remove("selected");
        button.setAttribute("aria-pressed", "false");
    });
}

function openTextChannel(channelName) {
    if (!currentUser || !channelName) return;

    // Clicking the channel that is already open folds it away again.
    if (activeTextChannel === channelName && loungeView && !loungeView.hidden) {
        showEmptyView();
        setMobileSidebar(false);
        return;
    }

    stopDirectMessages();
    showLoungeSidebar();
    hideMainViews();

    activeTextChannel = channelName;

    if (loungeView) loungeView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = false;

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

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("login.html");
        return;
    }

    currentUser = user;

    const displayName = (user.displayName || "Member").slice(0, 30);
    const profileName = document.getElementById("profileName");
    const currentUserElement = document.getElementById("currentUser");

    if (profileName) profileName.textContent = displayName;

    const currentName = currentUserElement?.querySelector("span");
    if (currentName) currentName.textContent = displayName;

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
    loadServerIcons();
    showLoungeSidebar();
    showEmptyView();
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

    stopMessagesListener = onSnapshot(messagesQuery, (snapshot) => {
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

            message.append(author, document.createTextNode(data.text || ""));
            messagesElement.appendChild(message);
        });

        messagesElement.scrollTop = messagesElement.scrollHeight;
    }, (error) => {
        console.error("Channel listener failed:", error);

        messagesElement.textContent = error.code === "failed-precondition"
            ? "This channel requires a Firestore index."
            : error.code === "permission-denied"
                ? "Firestore denied channel access. Publish the updated rules."
                : "Messages could not load.";
    });
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

function showDirectMessages() {
    if (!currentUser) return;

    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    selectedMember = null;
    currentConversationId = null;

    if (loungeSidebar) loungeSidebar.hidden = true;
    if (dmSidebar) dmSidebar.hidden = false;

    hideMainViews();

    if (dmHomeView) dmHomeView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = true;

    dmHomeButton?.classList.add("selected");
    dmHomeButton?.setAttribute("aria-pressed", "true");

    mainServerButton?.classList.remove("selected");
    mainServerButton?.setAttribute("aria-pressed", "false");

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
    showLoungeSidebar();
    showEmptyView();

    document.querySelectorAll(".server-icon").forEach((icon) => {
        icon.classList.remove("selected");
    });

    mainServerButton?.classList.add("selected");
    setMobileSidebar(false);
});

function loadMembers() {
    if (!dmMemberList) return;

    stopMembersListener?.();

    const membersQuery = query(
        collection(db, "users"),
        orderBy("displayName", "asc")
    );

    stopMembersListener = onSnapshot(membersQuery, (snapshot) => {
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
    }, (error) => {
        console.error("Member directory failed:", error);
        dmMemberList.textContent = "Members could not load.";
    });
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

        button.addEventListener("click", () => void openConversation(member));

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

    selectedMember = member;
    currentConversationId = getConversationId(currentUser.uid, member.uid);

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
            dmMessages.textContent = "This private conversation could not be opened.";
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

    stopDirectMessagesListener = onSnapshot(privateQuery, (snapshot) => {
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

            message.append(author, document.createTextNode(data.text || ""));
            dmMessages.appendChild(message);
        });

        dmMessages.scrollTop = dmMessages.scrollHeight;
    }, (error) => {
        console.error("Private message listener failed:", error);
        dmMessages.textContent = "Private messages could not load.";
    });
}

async function sendDirectMessage() {
    if (
        !currentUser ||
        !currentConversationId ||
        !selectedMember ||
        !dmMessageInput ||
        !dmSendButton
    ) {
        return;
    }

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

createServerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !serverNameInput || !serverVisibilityInput) return;

    const name = serverNameInput.value.trim();

    if (name.length < 2 || name.length > 40) return;

    try {
        await addDoc(collection(db, "servers"), {
            name,
            nameLower: name.toLowerCase(),
            visibility: serverVisibilityInput.value,
            ownerUid: currentUser.uid,
            memberUids: [currentUser.uid],
            createdAt: serverTimestamp()
        });

        closeServerModal();

        const server = {
            name,
            visibility: serverVisibilityInput.value
        };

        if (createdServers) {
            createdServers.appendChild(makeServerIcon(server));
        }

        openServer(server);
    } catch (error) {
        console.error("Server creation failed:", error);

        if (serverCreateStatus) {
            serverCreateStatus.textContent =
                error.code === "permission-denied"
                    ? "Firebase rejected this. Publish the servers rule."
                    : "The server could not be created.";
        }
    }
});

function openServer(server) {
    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    selectedMember = null;
    currentConversationId = null;

    showLoungeSidebar();
    hideMainViews();

    if (serverView) serverView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = true;

    if (serverViewName) {
        serverViewName.textContent = server.name;
    }

    if (serverWelcomeName) {
        serverWelcomeName.textContent = server.name;
    }

    if (serverViewVisibility) {
        serverViewVisibility.textContent =
            server.visibility === "public"
                ? "Public server — anyone can join"
                : "Private server — invite only";
    }

    document.querySelectorAll(".server-icon").forEach((icon) => {
        icon.classList.remove("selected");
    });

    server.button?.classList.add("selected");

    setMobileSidebar(false);
}

function makeServerIcon(server) {
    const icon = document.createElement("button");

    icon.type = "button";
    icon.className = "server-icon created-server";
    icon.title = server.name;
    icon.setAttribute("aria-label", `Open ${server.name}`);
    icon.textContent = server.name.trim().charAt(0).toUpperCase();

    server.button = icon;

    icon.addEventListener("click", () => openServer(server));

    return icon;
}

async function loadServerIcons() {
    if (!currentUser || !createdServers) return;

    try {
        const snapshot = await getDocs(
            query(
                collection(db, "servers"),
                where("memberUids", "array-contains", currentUser.uid)
            )
        );

        createdServers.replaceChildren();

        snapshot.forEach((entry) => {
            const data = entry.data();

            const server = {
                name: data.name || "Server",
                visibility: data.visibility || "private"
            };

            createdServers.appendChild(makeServerIcon(server));
        });
    } catch (error) {
        console.warn("Saved servers could not be listed:", error);
    }
}

async function logoutUser() {
    try {
        setMobileSidebar(false);
        stopPublicMessages();
        stopDirectMessages();
        stopMembersListener?.();

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

// The diamond logs out. The name beside it opens the profile editor.
logoutButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void logoutUser();
});

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

let currentAvatar = "diamond";
let uploadedPicture = "";
let rawPicture = "";
let cropScale = 1;
let cropX = 0;
let cropY = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;

function avatarStyleFor(key) {
    return AVATAR_STYLES[key] || AVATAR_STYLES.diamond;
}

function applyAvatar(key) {
    currentAvatar = AVATAR_STYLES[key] ? key : "diamond";

    const style = avatarStyleFor(currentAvatar);

    // A chosen picture wins over the preset colours.
    if (uploadedPicture) {
        if (myProfilePicture) {
            myProfilePicture.style.background = "transparent";
            myProfilePicture.style.backgroundImage = `url(${uploadedPicture})`;
            myProfilePicture.style.backgroundSize = "cover";
            myProfilePicture.style.backgroundPosition = "center";
            myProfilePicture.textContent = "";
        }

        if (profilePreviewImage) {
            profilePreviewImage.style.background = "transparent";
            profilePreviewImage.style.backgroundImage = `url(${uploadedPicture})`;
            profilePreviewImage.style.backgroundSize = "cover";
            profilePreviewImage.style.backgroundPosition = "center";
            profilePreviewImage.textContent = "";
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
        profilePreviewImage.style.backgroundImage = "none";
        profilePreviewImage.style.background = style.background;
        profilePreviewImage.style.color = style.color;
        profilePreviewImage.style.display = "flex";
        profilePreviewImage.style.alignItems = "center";
        profilePreviewImage.style.justifyContent = "center";
        profilePreviewImage.style.fontSize = "40px";
        profilePreviewImage.textContent =
            currentAvatar === "diamond" ? "\u2726" : style.glyph;
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
        }

        applyAvatar(
            typeof data.avatar === "string" ? data.avatar : "diamond"
        );
    } catch (error) {
        console.warn("Profile could not be read:", error);
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

/* ---------- CROP THE CHOSEN PICTURE ---------- */

function applyCropTransform() {
    if (!cropImage) return;

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

/* Bake the crop into a small square picture. */
function renderCroppedPicture() {
    return new Promise((resolve) => {
        if (!rawPicture) {
            resolve("");
            return;
        }

        const image = new Image();

        image.onload = () => {
            const SIZE = 192;
            const canvas = document.createElement("canvas");

            canvas.width = SIZE;
            canvas.height = SIZE;

            const ctx = canvas.getContext("2d");

            if (!ctx) {
                resolve("");
                return;
            }

            // Match the on-screen crop frame (160px).
            const FRAME = 160;
            const ratio = SIZE / FRAME;

            const baseScale = Math.max(
                FRAME / image.width,
                FRAME / image.height
            );

            const scale = baseScale * cropScale * ratio;

            const drawW = image.width * scale;
            const drawH = image.height * scale;

            const dx =
                SIZE / 2 - drawW / 2 + cropX * ratio;

            const dy =
                SIZE / 2 - drawH / 2 + cropY * ratio;

            ctx.drawImage(image, dx, dy, drawW, drawH);

            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };

        image.onerror = () => resolve("");
        image.src = rawPicture;
    });
}

profileChoiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
        uploadedPicture = "";
        rawPicture = "";

        if (profileCrop) {
            profileCrop.hidden = true;
        }

        applyAvatar(button.dataset.avatar);
    });
});

/* Choose a real picture from the device. */
if (profileUploadInput) {
    profileUploadInput.addEventListener("change", () => {
        const file = profileUploadInput.files?.[0];
        if (!file) return;

        if (!/^image\//i.test(file.type)) {
            if (profileStatus) {
                profileStatus.textContent = "Choose an image file.";
                profileStatus.className = "error";
            }

            profileUploadInput.value = "";
            return;
        }

        if (file.size > 400 * 1024) {
            if (profileStatus) {
                profileStatus.textContent =
                    "Pictures must be smaller than 400 KB.";
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
                cropImage.style.transform =
                    "translate(0px, 0px) scale(1)";
            }

            if (profileStatus) {
                profileStatus.textContent =
                    "Drag to position, then Save.";
                profileStatus.className = "success";
            }
        };

        reader.readAsDataURL(file);
    });
}

profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) return;

    const nextName = (profileDisplayName?.value || "")
        .trim()
        .slice(0, 30);

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
            uploadedPicture = await renderCroppedPicture();
        }

        // Only fields this user owns are written.
        await setDoc(
            doc(db, "users", currentUser.uid),
            {
                uid: currentUser.uid,
                displayName: nextName,
                avatar: currentAvatar,
                picture: uploadedPicture.slice(0, 400000),
                createdAt: serverTimestamp()
            },
            { merge: true }
        );

        if (profileName) {
            profileName.textContent = nextName;
        }

        const currentName = document
            .getElementById("currentUser")
            ?.querySelector("span");

        if (currentName) {
            currentName.textContent = nextName;
        }

        if (profileStatus) {
            profileStatus.textContent = "Profile saved.";
            profileStatus.className = "success";
        }

        window.setTimeout(closeProfileModal, 500);
    } catch (error) {
        console.error("Profile save failed:", error);

        if (profileStatus) {
            profileStatus.textContent =
                error.code === "permission-denied"
                    ? "Firestore rejected the profile update. Allow profile updates in your users rules."
                    : "Your profile could not be saved.";

            profileStatus.className = "error";
        }
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
});

window.logout = logoutUser;
window.sendMessage = sendMessage;

window.clearChat = () => {
    alert("Shared lounge messages cannot be cleared here.");
};

window.addEventListener("pagehide", () => {
    stopPublicMessages();
    stopDirectMessages();
    stopMembersListener?.();
});

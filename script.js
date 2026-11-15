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

const dashboard = document.querySelector(".dashboard");
const mobileSidebarBackdrop = document.getElementById("mobileSidebarBackdrop");
const mobileMenuButtons = document.querySelectorAll(".mobile-menu-button");

const dmHomeButton = document.getElementById("dmHomeButton");
const mainServerButton = document.getElementById("mainServerButton");
const logoutButton = document.getElementById("logoutButton");
const loungeSidebar = document.getElementById("loungeSidebar");
const dmSidebar = document.getElementById("dmSidebar");
const emptyView = document.getElementById("emptyView");
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
const serverNameInput = document.getElementById("serverName");
const serverVisibilityInput = document.getElementById("serverVisibility");
const serverCreateStatus = document.getElementById("serverCreateStatus");

const channelDescriptions = {
    general: "A little space to share what matters.",
    gaming: "Talk games, teams, releases, and play sessions.",
    streaming: "Share streams, clips, schedules, and creator updates.",
    announcements: "Important Diamond Lounge news and updates.",
    memes: "Share memes and community jokes.",
    "off-topic": "Everything that does not fit another channel."
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
    if (activeChannelName) activeChannelName.textContent = channelName;
    if (activeChannelDescription) {
        activeChannelDescription.textContent = channelDescriptions[channelName] || `Welcome to #${channelName}.`;
    }
    if (input) input.placeholder = `Message #${channelName}`;
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
        if (dmMemberList) dmMemberList.textContent = "Member profiles could not load.";
    }
    await loadProfile();
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
        alert(error.code === "permission-denied" ? "Firestore denied this message. Publish the updated rules." : "Message could not be sent.");
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
    const inDirectMessages = (dmHomeView && !dmHomeView.hidden) || (dmConversationView && !dmConversationView.hidden);
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
    setMobileSidebar(false);
});

function loadMembers() {
    if (!dmMemberList) return;
    stopMembersListener?.();
    const membersQuery = query(collection(db, "users"), orderBy("displayName", "asc"));
    stopMembersListener = onSnapshot(membersQuery, (snapshot) => {
        members = [];
        snapshot.forEach((entry) => {
            const data = entry.data();
            if (data.uid && data.uid !== currentUser?.uid && typeof data.displayName === "string") {
                members.push({ uid: data.uid, displayName: data.displayName });
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
    const filtered = members.filter((member) => member.displayName.toLowerCase().includes(searchText));
    if (!filtered.length) {
        const empty = document.createElement("li");
        empty.className = "dm-empty";
        empty.textContent = searchText ? "No members match your search." : "No other members have joined yet.";
        dmMemberList.appendChild(empty);
        return;
    }
    filtered.forEach((member) => {
        const item = document.createElement("li");
        item.className = "dm-member-item";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dm-member-button";
        if (selectedMember?.uid === member.uid) button.classList.add("active");
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
    if (dmMessages) dmMessages.textContent = "Opening private conversation...";
    try {
        const conversationRef = doc(db, "conversations", openingId);
        const snapshot = await getDoc(conversationRef);
        if (!snapshot.exists()) {
            await setDoc(conversationRef, {
                participantUids: [currentUser.uid, member.uid],
                createdAt: serverTimestamp()
            });
        }
        if (currentConversationId === openingId) loadDirectMessages();
    } catch (error) {
        console.error("Private conversation failed:", error);
        if (dmMessages) dmMessages.textContent = "This private conversation could not be opened.";
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
            if (data.uid === currentUser?.uid) message.classList.add("own-message");
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
    if (!currentUser || !currentConversationId || !selectedMember || !dmMessageInput || !dmSendButton) return;
    const text = dmMessageInput.value.trim();
    if (!text) return;
    dmSendButton.disabled = true;
    try {
        await addDoc(collection(db, "conversations", currentConversationId, "messages"), {
            uid: currentUser.uid,
            username: (currentUser.displayName || "Member").slice(0, 30),
            text: text.slice(0, 2000),
            timestamp: serverTimestamp()
        });
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
    if (serverCreateStatus) serverCreateStatus.textContent = "";
}
createServerButton?.addEventListener("click", openServerModal);
closeServerModalButton?.addEventListener("click", closeServerModal);
cancelServerCreation?.addEventListener("click", closeServerModal);
serverModal?.addEventListener("click", (event) => {
    if (event.target === serverModal) closeServerModal();
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
    } catch (error) {
        console.error("Server creation failed:", error);
        if (serverCreateStatus) serverCreateStatus.textContent = "The server could not be created.";
    }
});

async function logoutUser() {
    try {
        setMobileSidebar(false);
        stopPublicMessages();
        stopDirectMessages();
        stopMembersListener?.();
        if (window.leaveVoiceChat) await window.leaveVoiceChat();
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
const profileChoiceButtons = [...document.querySelectorAll(".profile-choice")];

const AVATAR_STYLES = {
    diamond: { background: "linear-gradient(145deg,#2b2924,#141416)", color: "#e1c98f", glyph: "\u2726" },
    gold: { background: "linear-gradient(145deg,#c7a96b,#8b7040)", color: "#1a1610", glyph: "G" },
    silver: { background: "linear-gradient(145deg,#c9ccd2,#8d9198)", color: "#191a1d", glyph: "S" },
    emerald: { background: "linear-gradient(145deg,#4f8a63,#2c5740)", color: "#eef7f0", glyph: "E" },
    ruby: { background: "linear-gradient(145deg,#a5535a,#6f2f36)", color: "#fbeeee", glyph: "R" },
    royal: { background: "linear-gradient(145deg,#5a5fa5,#33376f)", color: "#eeeffb", glyph: "V" }
};

let currentAvatar = "diamond";

function avatarStyleFor(key) {
    return AVATAR_STYLES[key] || AVATAR_STYLES.diamond;
}

function applyAvatar(key) {
    currentAvatar = AVATAR_STYLES[key] ? key : "diamond";
    const style = avatarStyleFor(currentAvatar);

    // The small picture sits beside the name, inside the profile box.
    if (myProfilePicture) {
        myProfilePicture.style.background = style.background;
        myProfilePicture.style.color = style.color;
        myProfilePicture.textContent = currentAvatar === "diamond" ? "\u2726" : style.glyph;
    }

    if (profilePreviewImage) {
        profilePreviewImage.style.background = style.background;
        profilePreviewImage.style.color = style.color;
        profilePreviewImage.style.display = "flex";
        profilePreviewImage.style.alignItems = "center";
        profilePreviewImage.style.justifyContent = "center";
        profilePreviewImage.style.fontSize = "40px";
        profilePreviewImage.textContent = currentAvatar === "diamond" ? "\u2726" : style.glyph;
    }

    profileChoiceButtons.forEach((button) => {
        button.classList.toggle("selected", button.dataset.avatar === currentAvatar);
    });
}

async function loadProfile() {
    if (!currentUser) return;

    try {
        const snapshot = await getDoc(doc(db, "users", currentUser.uid));
        const data = snapshot.exists() ? snapshot.data() : {};

        if (typeof data.displayName === "string" && data.displayName) {
            if (profileName) profileName.textContent = data.displayName;
        }

        applyAvatar(typeof data.avatar === "string" ? data.avatar : "diamond");
    } catch (error) {
        console.warn("Profile could not be read:", error);
        applyAvatar("diamond");
    }
}

function openProfileModal() {
    if (!profileModal || !currentUser) return;

    if (profileDisplayName) {
        profileDisplayName.value = profileName?.textContent?.trim() || "Member";
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
    if (profileStatus) profileStatus.textContent = "";
}

profileButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openProfileModal();
});

closeProfileModalButton?.addEventListener("click", closeProfileModal);
cancelProfileEdit?.addEventListener("click", closeProfileModal);

profileModal?.addEventListener("click", (event) => {
    if (event.target === profileModal) closeProfileModal();
});

profileChoiceButtons.forEach((button) => {
    button.addEventListener("click", () => applyAvatar(button.dataset.avatar));
});

profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    const nextName = (profileDisplayName?.value || "").trim().slice(0, 30);
    if (nextName.length < 2) {
        if (profileStatus) {
            profileStatus.textContent = "Display names need at least 2 characters.";
            profileStatus.className = "error";
        }
        return;
    }

    const saveButton = document.getElementById("saveProfileButton");
    if (saveButton) saveButton.disabled = true;

    try {
        // Only fields this user owns are written, so existing rules still apply.
        await setDoc(
            doc(db, "users", currentUser.uid),
            {
                uid: currentUser.uid,
                displayName: nextName,
                avatar: currentAvatar,
                createdAt: serverTimestamp()
            },
            { merge: true }
        );

        if (profileName) profileName.textContent = nextName;
        const currentName = document.getElementById("currentUser")?.querySelector("span");
        if (currentName) currentName.textContent = nextName;

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
        if (saveButton) saveButton.disabled = false;
    }
});

window.logout = logoutUser;
window.sendMessage = sendMessage;
window.clearChat = () => alert("Shared lounge messages cannot be cleared here.");

window.addEventListener("pagehide", () => {
    stopPublicMessages();
    stopDirectMessages();
    stopMembersListener?.();
});

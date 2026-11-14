
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
    setDoc
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";


// ==========================================
// PUBLIC CHAT ELEMENTS
// ==========================================

const messagesElement = document.getElementById("messages");
const input = document.getElementById("messageInput");
const messageForm = document.getElementById("messageForm");
const sendButton = document.getElementById("sendMessageButton");


// ==========================================
// MOBILE NAVIGATION ELEMENTS
// ==========================================

const dashboard = document.querySelector(".dashboard");
const mobileSidebarBackdrop = document.getElementById("mobileSidebarBackdrop");
const mobileMenuButtons = document.querySelectorAll(".mobile-menu-button");


// ==========================================
// DIRECT MESSAGE ELEMENTS
// ==========================================

const dmHomeButton = document.getElementById("dmHomeButton");

const loungeSidebar = document.getElementById("loungeSidebar");
const dmSidebar = document.getElementById("dmSidebar");

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


// ==========================================
// APPLICATION STATE
// ==========================================

let currentUser = null;
let chatLoaded = false;

let stopMessagesListener = null;
let stopMembersListener = null;
let stopDirectMessagesListener = null;

let members = [];
let selectedMember = null;
let currentConversationId = null;


// ==========================================
// MOBILE DRAWER CONTROLS
// ==========================================

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


function toggleMobileSidebar() {
    if (!dashboard) return;

    const isOpen = dashboard.classList.contains("mobile-nav-open");

    setMobileSidebar(!isOpen);
}


// Hamburger buttons
mobileMenuButtons.forEach((button) => {
    button.addEventListener("click", toggleMobileSidebar);
});


// Backdrop closes the drawer
mobileSidebarBackdrop?.addEventListener("click", () => {
    setMobileSidebar(false);
});


// Escape closes the drawer
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setMobileSidebar(false);
    }
});


// Selecting a text channel closes the mobile drawer
document.getElementById("channelsSidebar")?.addEventListener("click", (event) => {
    const channel = event.target.closest(".text-channel");

    if (channel) {
        setMobileSidebar(false);
    }
});


// ==========================================
// AUTHENTICATION
// ==========================================

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("login.html");
        return;
    }

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


// ==========================================
// MEMBER PROFILE SETUP
// ==========================================

async function ensureUserProfile() {
    if (!currentUser) return;

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


// ==========================================
// PUBLIC CHAT ATTACHMENTS
// ==========================================

function renderAttachment(message, attachment) {
    if (
        !attachment ||
        typeof attachment.url !== "string" ||
        !/^https:\/\/firebasestorage\.googleapis\.com\//i.test(attachment.url)
    ) {
        return;
    }

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


// ==========================================
// LOAD PUBLIC CHAT
// ==========================================

function loadMessages() {
    if (!messagesElement) return;

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


// ==========================================
// SEND PUBLIC MESSAGE
// ==========================================

async function sendMessage() {
    if (!currentUser || !input || !sendButton) return;

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


// ==========================================
// DIRECT MESSAGE NAVIGATION
// ==========================================

function showDirectMessages() {
    if (!currentUser) return;

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


function showLounge() {
    stopDirectMessages();

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


function showConversationView() {
    if (dmHomeView) dmHomeView.hidden = true;
    if (dmConversationView) dmConversationView.hidden = false;
    if (loungeView) loungeView.hidden = true;

    if (dmSidebar) dmSidebar.hidden = false;
    if (loungeSidebar) loungeSidebar.hidden = true;
    if (communitySidebar) communitySidebar.hidden = true;

    document.body.classList.add("dm-mode");

    // Selecting a member returns to the conversation.
    setMobileSidebar(false);
}


// ==========================================
// LOAD MEMBER DIRECTORY
// ==========================================

function loadMembers() {
    if (!dmMemberList) return;

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


// ==========================================
// DISPLAY MEMBER DIRECTORY
// ==========================================

function renderMembers() {
    if (!dmMemberList) return;

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


// ==========================================
// CREATE / OPEN PRIVATE CONVERSATION
// ==========================================

function getConversationId(firstUid, secondUid) {
    return [firstUid, secondUid]
        .sort()
        .join("_");
}


async function openConversation(member) {
    if (!currentUser || !member || !member.uid) return;

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


// ==========================================
// STOP PRIVATE MESSAGE LISTENER
// ==========================================

function stopDirectMessages() {
    if (stopDirectMessagesListener) {
        stopDirectMessagesListener();
        stopDirectMessagesListener = null;
    }
}


// ==========================================
// LOAD PRIVATE MESSAGES
// ==========================================

function loadDirectMessages() {
    if (!currentConversationId || !dmMessages) return;

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


// ==========================================
// SEND PRIVATE MESSAGE
// ==========================================

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


// ==========================================
// BUTTONS AND EVENTS
// ==========================================

// The large diamond toggles between the Lounge and DMs.
// It also works while a private conversation is open.
dmHomeButton?.addEventListener("click", () => {
    if (dmSidebar && !dmSidebar.hidden) {
        showLounge();
    } else {
        showDirectMessages();
    }
});

memberSearch?.addEventListener("input", renderMembers);

messageForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
});

dmMessageForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendDirectMessage();
});


// ==========================================
// EXISTING PUBLIC FUNCTIONS
// ==========================================

window.sendMessage = sendMessage;

window.clearChat = () => {
    alert("Shared lounge messages are visible to everyone and cannot be cleared here.");
};


// ==========================================
// LOGOUT — BOTTOM PROFILE DIAMOND
// ==========================================

window.logout = async () => {
    try {
        setMobileSidebar(false);

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


// ==========================================
// CLEANUP
// ==========================================

window.addEventListener("pagehide", () => {
    stopMessagesListener?.();
    stopMembersListener?.();
    stopDirectMessages();
});

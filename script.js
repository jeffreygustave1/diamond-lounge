import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "[gstatic.com](https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js)";

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
} from "[gstatic.com](https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js)";

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
const createdServers = document.getElementById("createdServers");

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
window.getActiveTextChannel = () => activeTextChannel;


let stopMessagesListener = null;
let stopMembersListener = null;
let stopDirectMessagesListener = null;
let stopServersListener = null;

let members = [];
let selectedMember = null;
let currentConversationId = null;

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
    setMobileSidebar(!dashboard?.classList.contains("mobile-nav-open"));
}

mobileMenuButtons.forEach((button) => {
    button.addEventListener("click", toggleMobileSidebar);
});

mobileSidebarBackdrop?.addEventListener("click", () => {
    setMobileSidebar(false);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setMobileSidebar(false);
        closeServerModal();
    }
});

function hideMainViews() {
    if (emptyView) emptyView.hidden = true;
    if (loungeView) loungeView.hidden = true;
    if (dmHomeView) dmHomeView.hidden = true;
    if (dmConversationView) dmConversationView.hidden = true;
}

function showEmptyView() {
    stopMessages();

    activeTextChannel = null;
    hideMainViews();

    if (emptyView) emptyView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = true;

    textChannelButtons.forEach((button) => {
        button.classList.remove("selected");
        button.setAttribute("aria-pressed", "false");
    });
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

function openTextChannel(channelName) {
    if (!currentUser || !channelName) return;

    const clickedActiveChannel =
        activeTextChannel === channelName &&
        loungeView &&
        !loungeView.hidden;

    if (clickedActiveChannel) {
        showEmptyView();
        setMobileSidebar(false);
        return;
    }

    stopDirectMessages();
    selectedMember = null;
    currentConversationId = null;

    showLoungeSidebar();
    hideMainViews();

    activeTextChannel = channelName;

    if (loungeView) loungeView.hidden = false;
    if (communitySidebar) communitySidebar.hidden = false;

    textChannelButtons.forEach((button) => {
        const selected = button.dataset.channel === channelName;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

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

    loadMessages(channelName);
    setMobileSidebar(false);
}

textChannelButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
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
        loadServers();
    } catch (error) {
        console.error("Profile setup failed:", error);

        if (dmMemberList) {
            dmMemberList.textContent =
                "Member profiles could not load. Please refresh and try again.";
        }
    }

    showEmptyView();
});

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

function renderAttachment(message, attachment) {
    if (
        !attachment ||
        typeof attachment.url !== "string" ||
        !/^https:\/\/firebasestorage\.googleapis\.com\//i.test(attachment.url)
    ) {
        return;
    }

    const type = typeof attachment.type === "string" ? attachment.type : "";
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

function stopMessages() {
    stopMessagesListener?.();
    stopMessagesListener = null;
}

function loadMessages(channelName) {
    if (!messagesElement || !channelName) return;

    stopMessages();
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

                message.append(author, document.createTextNode(data.text || ""));
                renderAttachment(message, data.attachment);
                messagesElement.appendChild(message);
            });

            messagesElement.scrollTop = messagesElement.scrollHeight;
        },
        (error) => {
            console.error("Chat listener failed:", error);

            messagesElement.textContent =
                error.code === "failed-precondition"
                    ? "This channel needs a Firestore index. Open the index link in the browser console once, create it, and reload."
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

    if (text.length > 2000) {
        alert("Messages cannot exceed 2000 characters.");
        return;
    }

    sendButton.disabled = true;

    try {
        await addDoc(collection(db, "messages"), {
            uid: currentUser.uid,
            username: (currentUser.displayName || "Member").slice(0, 30),
            channelId: activeTextChannel,
            text,
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

    stopMessages();
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

dmHomeButton?.addEventListener("click", () => {
    if (
        (dmHomeView && !dmHomeView.hidden) ||
        (dmConversationView && !dmConversationView.hidden)
    ) {
        showEmptyView();
        showLoungeSidebar();
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

    const filteredMembers = members.filter((member) =>
        member.displayName.toLowerCase().includes(searchText)
    );

    if (!filteredMembers.length) {
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

memberSearch?.addEventListener("input", renderMembers);

function getConversationId(firstUid, secondUid) {
    return [firstUid, secondUid].sort().join("_");
}

async function openConversation(member) {
    if (!currentUser || !member?.uid) return;

    stopDirectMessages();

    selectedMember = member;
    currentConversationId = getConversationId(currentUser.uid, member.uid);
    const openingConversationId = currentConversationId;

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
        const conversationRef = doc(
            db,
            "conversations",
            openingConversationId
        );

        const conversationSnapshot = await getDoc(conversationRef);

        if (!conversationSnapshot.exists()) {
            await setDoc(conversationRef, {
                participantUids: [currentUser.uid, member.uid],
                createdAt: serverTimestamp()
            });
        }

        if (currentConversationId !== openingConversationId) return;
        loadDirectMessages();
    } catch (error) {
        console.error("Private conversation failed:", error);

        if (dmMessages) {
            dmMessages.textContent =
                error.code === "permission-denied"
                    ? "Access denied. Check the conversation rules."
                    : "This private conversation could not be opened.";
        }
    }
}

function stopDirectMessages() {
    stopDirectMessagesListener?.();
    stopDirectMessagesListener = null;
}

function loadDirectMessages() {
    if (!currentConversationId || !dmMessages) return;

    stopDirectMessages();

    const privateMessagesQuery = query(
        collection(db, "conversations", currentConversationId, "messages"),
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

                message.append(author, document.createTextNode(data.text || ""));
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
    ) {
        return;
    }

    const text = dmMessageInput.value.trim();
    if (!text) return;

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

    if (serverCreateStatus) {
        serverCreateStatus.textContent = "";
        serverCreateStatus.className = "";
    }

    requestAnimationFrame(() => serverNameInput?.focus());
}

function closeServerModal() {
    if (!serverModal || serverModal.hidden) return;

    serverModal.hidden = true;
    document.body.classList.remove("modal-open");
    createServerForm?.reset();

    if (serverCreateStatus) {
        serverCreateStatus.textContent = "";
        serverCreateStatus.className = "";
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
    const visibility = serverVisibilityInput.value;

    if (name.length < 2 || name.length > 40) {
        serverCreateStatus.textContent =
            "Server names must contain 2 to 40 characters.";
        serverCreateStatus.className = "error";
        return;
    }

    const submitButton = document.getElementById("confirmCreateServer");
    submitButton.disabled = true;
    serverCreateStatus.textContent = "Creating your server...";
    serverCreateStatus.className = "";

    try {
        await addDoc(collection(db, "servers"), {
            name,
            nameLower: name.toLowerCase(),
            visibility,
            ownerUid: currentUser.uid,
            memberUids: [currentUser.uid],
            createdAt: serverTimestamp()
        });

        serverCreateStatus.textContent = "Server created.";
        serverCreateStatus.className = "success";

        window.setTimeout(closeServerModal, 500);
    } catch (error) {
        console.error("Server creation failed:", error);
        serverCreateStatus.textContent =
            error.code === "permission-denied"
                ? "Firebase denied server creation. Publish the updated rules."
                : "The server could not be created.";
        serverCreateStatus.className = "error";
    } finally {
        submitButton.disabled = false;
    }
});

function loadServers() {
    if (!currentUser || !createdServers) return;

    stopServersListener?.();

    const serversQuery = query(
        collection(db, "servers"),
        where("memberUids", "array-contains", currentUser.uid)
    );

    stopServersListener = onSnapshot(
        serversQuery,
        (snapshot) => {
            createdServers.replaceChildren();

            snapshot.forEach((entry) => {
                const data = entry.data();
                const button = document.createElement("button");

                button.type = "button";
                button.className = "server-icon created-server";
                button.title = data.name || "Server";
                button.setAttribute(
                    "aria-label",
                    `Open ${data.name || "server"}`
                );
                button.textContent =
                    (data.name || "S").trim().charAt(0).toUpperCase();

                button.addEventListener("click", () => {
                    alert(
                        `${data.name || "This server"} was created successfully. ` +
                        "Its custom channel workspace can be added next."
                    );
                });

                createdServers.appendChild(button);
            });
        },
        (error) => {
            console.error("Server list failed:", error);
        }
    );
}

window.sendMessage = sendMessage;

window.clearChat = () => {
    alert("Shared lounge messages cannot be cleared here.");
};

window.logout = async () => {
    try {
        setMobileSidebar(false);

        stopMessages();
        stopDirectMessages();
        stopMembersListener?.();
        stopServersListener?.();

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

window.addEventListener("pagehide", () => {
    stopMessages();
    stopMembersListener?.();
    stopServersListener?.();
    stopDirectMessages();
});

import { auth, db } from "./firebase.js";

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

// Keep private conversations inside the main chat column, not as a BODY sibling.
const dmMainChatArea = document.querySelector(".chat-area");
if (dmConversationView && dmMainChatArea && dmConversationView.parentElement !== dmMainChatArea) {
    dmMainChatArea.appendChild(dmConversationView);
}
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
const profileBadgesInput = document.getElementById("profileBadgesInput");
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
let activeCreatedServerRecord = null;
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
let createdServerSidebarVoiceStops = new Map();
let pendingInviteServer = null;
let pendingInviteChannelId = null;
let activeCreatedServerVoiceChannel = null;
let primaryVoiceChannelName = null;
let primaryVoiceRoomId = null;
let primaryVoicePresenceStop = null;
let createdServerRemoteMediaLayer = null;
let remoteVideoGridHomeParent = null;
let remoteScreenStageHomeParent = null;


const createdServerTextChannels = document.getElementById("createdServerTextChannels");
// Text and voice channels share one category-aware Discord-style channel tree.
const createdServerVoiceChannels = createdServerTextChannels;
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
const DIAMOND_LOUNGE_OWNER_UID = "NlOxj6tdInP9SMKcYIUtz1MeZ2z2";
function isDiamondLoungeOwner() {
    const uid = auth.currentUser?.uid || currentUser?.uid;
    return Boolean(uid && uid === DIAMOND_LOUNGE_OWNER_UID);
}

// Every launch cosmetic below is usable by members at no charge.
// Silver GIF upload remains a separate, entitlement-controlled exclusive.
const PROFILE_COSMETIC_CATALOG = {
    aura: [
        { id: "none", label: "Natural", swatch: "linear-gradient(135deg,#34363d,#17191e)" },
        { id: "moonlight", label: "Moonlight", swatch: "linear-gradient(135deg,#d5e5ff,#667ca8)" },
        { id: "starlight", label: "Starlight", swatch: "linear-gradient(135deg,#fff0b9,#d69d48)" },
        { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg,#6df4d2,#687ce7)" },
        { id: "nebula", label: "Nebula", swatch: "linear-gradient(135deg,#d48bff,#5268d8)" },
        { id: "ember", label: "Ember", swatch: "linear-gradient(135deg,#ffbf74,#d44c4c)" },
        { id: "frost", label: "Frost", swatch: "linear-gradient(135deg,#e2fbff,#78c9e7)" },
        { id: "rose", label: "Rose", swatch: "linear-gradient(135deg,#ffd1df,#b85f90)" }
    ],
    frame: [
        { id: "none", label: "No frame", swatch: "linear-gradient(135deg,#34363d,#17191e)" },
        { id: "silver", label: "Silver", swatch: "linear-gradient(135deg,#f0f4fa,#8e9aa9)" },
        { id: "gold", label: "Gold", swatch: "linear-gradient(135deg,#ffe6a0,#a87932)" },
        { id: "diamond", label: "Diamond", swatch: "linear-gradient(135deg,#e8ffff,#68cbd8)" },
        { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg,#74f4cf,#5a75e9)" },
        { id: "obsidian", label: "Obsidian", swatch: "linear-gradient(135deg,#777b8a,#171820)" },
        { id: "rose", label: "Rose gold", swatch: "linear-gradient(135deg,#ffd0c0,#a85e68)" },
        { id: "celestial", label: "Celestial", swatch: "linear-gradient(135deg,#fff2c8,#9a88e8)" },
        { id: "sapphire", label: "Sapphire", swatch: "linear-gradient(135deg,#8ec9ff,#344da8)" }
    ],
    nameplate: [
        { id: "classic", label: "Classic", swatch: "linear-gradient(135deg,#e8e8eb,#aeb3bb)" },
        { id: "champagne", label: "Champagne", swatch: "linear-gradient(135deg,#fff0c7,#c49b57)" },
        { id: "silverline", label: "Silverline", swatch: "linear-gradient(135deg,#f2f7ff,#8d9bae)" },
        { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg,#7df5d6,#9d83f5)" },
        { id: "sapphire", label: "Sapphire", swatch: "linear-gradient(135deg,#9fd6ff,#5378d8)" },
        { id: "rosegold", label: "Rose gold", swatch: "linear-gradient(135deg,#ffe0d7,#cc7e8c)" },
        { id: "obsidian", label: "Obsidian", swatch: "linear-gradient(135deg,#e3d9c6,#7f756a)" },
        { id: "emerald", label: "Emerald", swatch: "linear-gradient(135deg,#b5f4c9,#4c9d74)" },
        { id: "violet", label: "Violet", swatch: "linear-gradient(135deg,#e1cbff,#9872de)" }
    ],
    badges: [
        { id: "comet", label: "Comet", symbol: "☄", swatch: "linear-gradient(135deg,#ffdfaa,#d17942)" },
        { id: "starlight", label: "Starlight", symbol: "✦", swatch: "linear-gradient(135deg,#fff0b9,#d59b48)" },
        { id: "music", label: "Music lover", symbol: "♫", swatch: "linear-gradient(135deg,#c9b8ff,#7667c7)" },
        { id: "gamer", label: "Gamer", symbol: "⌘", swatch: "linear-gradient(135deg,#9bd7ff,#4677bb)" },
        { id: "creator", label: "Creator", symbol: "✧", swatch: "linear-gradient(135deg,#ffc5e3,#b65e96)" },
        { id: "artist", label: "Artist", symbol: "❖", swatch: "linear-gradient(135deg,#ffd1b1,#ba784d)" },
        { id: "explorer", label: "Explorer", symbol: "⌖", swatch: "linear-gradient(135deg,#b8e8d6,#4e927b)" },
        { id: "builder", label: "Builder", symbol: "⚒", swatch: "linear-gradient(135deg,#e6d2ad,#90734c)" },
        { id: "bookworm", label: "Bookworm", symbol: "▤", swatch: "linear-gradient(135deg,#c5d2f4,#647aa8)" },
        { id: "bloom", label: "Bloom", symbol: "✿", swatch: "linear-gradient(135deg,#ffd5df,#ca759a)" },
        { id: "frost", label: "Frost", symbol: "❄", swatch: "linear-gradient(135deg,#e4fbff,#71b7d5)" },
        { id: "flame", label: "Flame", symbol: "♨", swatch: "linear-gradient(135deg,#ffd18f,#d65c45)" },
        { id: "crown", label: "Crown", symbol: "♛", swatch: "linear-gradient(135deg,#fff0b9,#b68a36)" },
        { id: "moon", label: "Moon", symbol: "☾", swatch: "linear-gradient(135deg,#d7dcff,#6b75ad)" },
        { id: "crystal", label: "Crystal", symbol: "◇", swatch: "linear-gradient(135deg,#d8ffff,#6ab8bb)" }
    ],
    backdrop: [
        { id: "midnight", label: "Midnight", swatch: "linear-gradient(135deg,#202630,#101318)" },
        { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg,#193f43,#25254b)" },
        { id: "sapphire", label: "Sapphire", swatch: "linear-gradient(135deg,#1c3457,#141b2d)" },
        { id: "rose", label: "Rose", swatch: "linear-gradient(135deg,#432938,#21191f)" },
        { id: "emerald", label: "Emerald", swatch: "linear-gradient(135deg,#1f4034,#15221e)" },
        { id: "sunset", label: "Sunset", swatch: "linear-gradient(135deg,#52352d,#24202a)" },
        { id: "violet", label: "Violet", swatch: "linear-gradient(135deg,#392d54,#1d1a2c)" },
        { id: "champagne", label: "Champagne", swatch: "linear-gradient(135deg,#4b4030,#211e19)" }
    ]
};

const SERVER_THEME_CATALOG = [
    { id: "midnight", label: "Midnight", sidebar: "#282b35", chat: "#30333e", header: "linear-gradient(100deg,#272b39,#3a4052)", accent: "#b8c7ff" },
    { id: "aurora", label: "Aurora", sidebar: "#20383b", chat: "#294146", header: "linear-gradient(100deg,#21434a,#396c69)", accent: "#8cebd2" },
    { id: "sapphire", label: "Sapphire", sidebar: "#1e2c46", chat: "#263750", header: "linear-gradient(100deg,#20395b,#315782)", accent: "#a8d5ff" },
    { id: "rose", label: "Rose", sidebar: "#3b2936", chat: "#45313e", header: "linear-gradient(100deg,#4a2d3b,#70475c)", accent: "#ffc1d8" },
    { id: "emerald", label: "Emerald", sidebar: "#26392f", chat: "#30453a", header: "linear-gradient(100deg,#294436,#406b50)", accent: "#a8e8bd" },
    { id: "sunset", label: "Sunset", sidebar: "#402f2c", chat: "#4b3935", header: "linear-gradient(100deg,#57362d,#8a5540)", accent: "#ffd0a3" },
    { id: "violet", label: "Violet", sidebar: "#332b46", chat: "#3c3451", header: "linear-gradient(100deg,#3b3158,#625184)", accent: "#dcc4ff" },
    { id: "champagne", label: "Champagne", sidebar: "#39352e", chat: "#454036", header: "linear-gradient(100deg,#514633,#756141)", accent: "#f1d8a2" }
];

const DEFAULT_PROFILE_COSMETICS = {
    aura: "none",
    frame: "none",
    nameplate: "classic",
    badges: [],
    backdrop: "midnight"
};
let currentProfileCosmetics = { ...DEFAULT_PROFILE_COSMETICS, badges: [] };
let selectedProfileCosmetics = { ...DEFAULT_PROFILE_COSMETICS, badges: [] };
let activeServerAppearanceTheme = "midnight";


function normalizeProfileCosmetics(value) {
    const source = value && typeof value === "object" ? value : {};
    const valid = (group, id, fallback) =>
        PROFILE_COSMETIC_CATALOG[group].some(option => option.id === id) ? id : fallback;
    return {
        aura: valid("aura", source.aura, DEFAULT_PROFILE_COSMETICS.aura),
        frame: valid("frame", source.frame, DEFAULT_PROFILE_COSMETICS.frame),
        nameplate: valid("nameplate", source.nameplate, DEFAULT_PROFILE_COSMETICS.nameplate),
        backdrop: valid("backdrop", source.backdrop, DEFAULT_PROFILE_COSMETICS.backdrop),
        badges: Array.isArray(source.badges)
            ? [...new Set(source.badges.filter(id => PROFILE_COSMETIC_CATALOG.badges.some(option => option.id === id)))].slice(0, 3)
            : []
    };
}
function cosmeticClassNames(cosmetics) {
    const c = normalizeProfileCosmetics(cosmetics);
    return [
        c.aura !== "none" ? "dl-aura-" + c.aura : "",
        c.frame !== "none" ? "dl-frame-" + c.frame : "",
        c.nameplate !== "classic" ? "dl-nameplate-" + c.nameplate : "",
        c.backdrop !== "midnight" ? "dl-backdrop-" + c.backdrop : ""
    ].filter(Boolean);
}
function applyProfileCosmetics() {
    const c = normalizeProfileCosmetics(selectedProfileCosmetics);
    const avatarTargets = [
        myProfilePicture,
        document.getElementById("mainVoiceUserAvatar"),
        document.getElementById("createdServerVoiceUserAvatar"),
        document.querySelector(".profile-modal-preview")
    ].filter(Boolean);
    avatarTargets.forEach(element => {
        [...element.classList].filter(name =>
            name.startsWith("dl-aura-") || name.startsWith("dl-frame-")
        ).forEach(name => element.classList.remove(name));
        cosmeticClassNames(c).filter(name => name.startsWith("dl-aura-") || name.startsWith("dl-frame-"))
            .forEach(name => element.classList.add(name));
    });

    const nameTargets = [
        profileName,
        currentUserElement?.querySelector("span"),
        document.getElementById("mainVoiceUserName"),
        document.getElementById("createdServerVoiceUserName")
    ].filter(Boolean);
    nameTargets.forEach(element => {
        [...element.classList].filter(name => name.startsWith("dl-nameplate-"))
            .forEach(name => element.classList.remove(name));
        const nameplateClass = cosmeticClassNames(c).find(name => name.startsWith("dl-nameplate-"));
        if (nameplateClass) element.classList.add(nameplateClass);
    });

    const backdropTargets = [
        document.querySelector(".profile-card"),
        ...document.querySelectorAll(".created-server-voice-user-row")
    ].filter(Boolean);
    backdropTargets.forEach(element => {
        [...element.classList].filter(name => name.startsWith("dl-backdrop-"))
            .forEach(name => element.classList.remove(name));
        if (c.backdrop !== "midnight") element.classList.add("dl-backdrop-" + c.backdrop);
    });

    renderCosmeticBadgeRail(document.getElementById("profileCosmeticBadges"), c.badges);
    renderCosmeticBadgeRail(document.getElementById("currentUserCosmeticBadges"), c.badges);
    renderCosmeticBadgeRail(document.getElementById("mainVoiceUserCosmeticBadges"), c.badges);
    renderCosmeticBadgeRail(document.getElementById("createdServerVoiceUserCosmeticBadges"), c.badges);
}
function renderCosmeticBadgeRail(container, badgeIds) {
    if (!container) return;
    container.replaceChildren();
    (Array.isArray(badgeIds) ? badgeIds : []).slice(0, 3).forEach(id => {
        const option = PROFILE_COSMETIC_CATALOG.badges.find(item => item.id === id);
        if (!option) return;
        const chip = document.createElement("span");
        chip.className = "dl-cosmetic-badge-chip";
        chip.textContent = option.symbol;
        chip.title = option.label;
        chip.setAttribute("aria-label", option.label);
        container.append(chip);
    });
}
function renderCosmeticPicker(containerId, group) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();
    const isBadgeGroup = group === "badges";
    PROFILE_COSMETIC_CATALOG[group].forEach(option => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dl-cosmetic-option";
        const chosen = isBadgeGroup
            ? selectedProfileCosmetics.badges.includes(option.id)
            : selectedProfileCosmetics[group] === option.id;
        button.classList.toggle("selected", chosen);
        button.setAttribute("aria-pressed", chosen ? "true" : "false");
        button.title = option.label;

        const swatch = document.createElement("span");
        swatch.className = "dl-cosmetic-swatch";
        if (isBadgeGroup) {
            swatch.classList.add("is-symbol");
            swatch.textContent = option.symbol;
        } else {
            swatch.style.background = option.swatch;
        }
        const label = document.createElement("span");
        label.className = "dl-cosmetic-option-label";
        label.textContent = option.label;
        button.append(swatch, label);

        button.addEventListener("click", () => {
            if (isBadgeGroup) {
                const next = selectedProfileCosmetics.badges.filter(id => id !== option.id);
                if (next.length === selectedProfileCosmetics.badges.length) {
                    if (next.length >= 3) {
                        const note = document.getElementById("dlStorePaymentNote");
                        if (note) note.textContent = "Choose up to three profile badges at a time.";
                        return;
                    }
                    next.push(option.id);
                }
                selectedProfileCosmetics.badges = next;
            } else {
                selectedProfileCosmetics[group] = option.id;
            }
            renderCosmeticPickers();
            applyProfileCosmetics();
            const note = document.getElementById("dlStorePaymentNote");
            if (note) note.textContent = "Preview updated. Click Save profile below to keep your selected styles.";
        });
        container.append(button);
    });
}
function renderServerThemePicker() {
    const container = document.getElementById("dlServerThemeOptions");
    const note = document.getElementById("dlServerThemeStatus");
    if (!container) return;
    container.replaceChildren();
    const canCustomize = Boolean(
        currentUser && activeCreatedServerId && activeCreatedServerOwnerUid === currentUser.uid
    );
    if (note) {
        note.textContent = canCustomize
            ? "Choose a theme for the server you're currently viewing. Changes save immediately for everyone in that server."
            : "Open a server you own to customize its shared theme. Only that server's owner can change it.";
    }
    SERVER_THEME_CATALOG.forEach(theme => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dl-cosmetic-option";
        button.disabled = !canCustomize;
        button.classList.toggle("selected", activeServerAppearanceTheme === theme.id);
        button.setAttribute("aria-pressed", activeServerAppearanceTheme === theme.id ? "true" : "false");
        const swatch = document.createElement("span");
        swatch.className = "dl-cosmetic-swatch";
        swatch.style.background = theme.header;
        const label = document.createElement("span");
        label.className = "dl-cosmetic-option-label";
        label.textContent = theme.label;
        button.append(swatch, label);
        button.addEventListener("click", () => void saveServerAppearanceTheme(theme.id));
        container.append(button);
    });
}
function renderCosmeticPickers() {
    renderCosmeticPicker("dlAuraOptions", "aura");
    renderCosmeticPicker("dlFrameOptions", "frame");
    renderCosmeticPicker("dlNameplateOptions", "nameplate");
    renderCosmeticPicker("dlProfileBadgeOptions", "badges");
    renderCosmeticPicker("dlBackdropOptions", "backdrop");
    renderServerThemePicker();
}
function applyServerAppearanceTheme(id) {
    const theme = SERVER_THEME_CATALOG.find(item => item.id === id) || SERVER_THEME_CATALOG[0];
    activeServerAppearanceTheme = theme.id;
    const workspace = document.getElementById("createdServerWorkspace");
    if (!workspace) return;
    workspace.style.setProperty("--dl-server-sidebar", theme.sidebar);
    workspace.style.setProperty("--dl-server-chat", theme.chat);
    workspace.style.setProperty("--dl-server-header", theme.header);
    workspace.style.setProperty("--dl-server-accent", theme.accent);
    workspace.dataset.dlTheme = theme.id;
}
async function saveServerAppearanceTheme(id) {
    if (!activeCreatedServerId || activeCreatedServerOwnerUid !== currentUser?.uid) {
        const note = document.getElementById("dlServerThemeStatus");
        if (note) note.textContent = "You must be the owner of an open server to change its theme.";
        return;
    }
    const theme = SERVER_THEME_CATALOG.find(item => item.id === id);
    if (!theme) return;
    const note = document.getElementById("dlServerThemeStatus");
    try {
        await updateDoc(doc(db, "servers", activeCreatedServerId), { appearanceTheme: theme.id });
        if (activeCreatedServerRecord && activeCreatedServerRecord.id === activeCreatedServerId) {
            activeCreatedServerRecord.appearanceTheme = theme.id;
        }
        applyServerAppearanceTheme(theme.id);
        renderServerThemePicker();
        if (note) note.textContent = theme.label + " theme saved for this server.";
    } catch (error) {
        console.error("Server theme update failed:", error);
        if (note) note.textContent = "The server theme could not be saved. Check that you own this server.";
    }
}
function syncCustomizationShopOwnerState() {
    const owner = isDiamondLoungeOwner();
    const heading = document.querySelector(".dl-store-heading p");
    if (heading) {
        heading.textContent = owner
            ? "Owner benefit active: every launch profile style and server theme is free for you. Silver GIF uploads are included too."
            : "Every launch aura, frame, nameplate, badge and profile backdrop is free for members. Silver animated profile GIFs remain a separate Silver exclusive.";
    }
    const silverBadge = document.querySelector('.dl-store-item.silver .dl-store-lock');
    const silverButton = document.querySelector('[data-cosmetic="silver-gif"]');
    if (silverBadge) silverBadge.textContent = owner ? "✦ OWNER ACCESS · FREE" : "✦ SILVER EXCLUSIVE";
    if (silverButton) {
        silverButton.textContent = owner ? "Included · Free" : "View Silver";
        silverButton.setAttribute("aria-label", owner
            ? "Silver GIF pack included free for the Diamond Lounge owner"
            : "View Silver GIF pack details");
    }
    const note = document.getElementById("dlStorePaymentNote");
    if (note) {
        note.textContent = owner
            ? "All profile cosmetics are available free to the owner. Select styles above, preview them next to your avatar/name, then click Save profile."
            : "The full launch styling collection is free for all members. Select your favorite options, preview them, then click Save profile. Silver GIF access is separate.";
    }
}
let silverGifEntitled = false;
let pendingGifFile = null;
let currentProfileBadges = [];
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
        const effective = new Set(["viewChannels", "sendMessages", "connectVoice", "speak"]);
        roleIds.forEach(roleId => (roles.get(roleId) || []).forEach(permission => effective.add(permission)));
        if (uid === serverSnapshot.data().ownerUid) effective.add("*");
        await updateDoc(memberRef, { roleIds, permissions: [...effective] });
    }));
}

// ==================================================
// MOBILE NAVIGATION
// ==================================================

// Mobile created-server navigation is placed into the second column (channel sidebar).
const createdServerPanel = document.querySelector(".created-server-channel-panel");
const createdServerPanelHome = createdServerPanel?.parentElement;
const createdServerPanelMarker = document.createComment("created-server-panel-home");
if (createdServerPanel) createdServerPanelHome?.insertBefore(createdServerPanelMarker, createdServerPanel);
function syncCreatedServerPanelLayout() {
    if (!createdServerPanel || !createdServerPanelMarker.parentNode) return;
    if (window.matchMedia("(max-width: 900px)").matches && serverView && !serverView.hidden) {
        const destination = document.getElementById("channelsSidebar");
        if (destination && createdServerPanel.parentElement !== destination) destination.appendChild(createdServerPanel);
    } else if (createdServerPanel.parentElement !== createdServerPanelMarker.parentNode) {
        createdServerPanelMarker.parentNode.insertBefore(createdServerPanel, createdServerPanelMarker.nextSibling);
    }
}
window.addEventListener("resize", syncCreatedServerPanelLayout);

function setMobileSidebar(open) {
    if (!dashboard) return;
    dashboard.classList.toggle("mobile-nav-open", open);
}

mobileSidebarBackdrop?.addEventListener("click", () => {
    setMobileSidebar(false);
});

// MOBILE ONLY: intercept horizontal gestures for the drawer; never use them for page navigation.
(() => {
    const mobileQuery = window.matchMedia("(max-width: 900px)");
    let startX = 0, startY = 0, tracking = false, horizontal = false;
    document.addEventListener("touchstart", (event) => {
        if (!mobileQuery.matches || event.touches.length !== 1) { tracking = false; return; }
        const t = event.touches[0];
        startX = t.clientX; startY = t.clientY; tracking = true; horizontal = false;
    }, { passive: true, capture: true });
    document.addEventListener("touchmove", (event) => {
        if (!tracking || !mobileQuery.matches || event.touches.length !== 1) return;
        const t = event.touches[0], dx = t.clientX - startX, dy = t.clientY - startY;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.15) {
            horizontal = true;
            if (event.cancelable) event.preventDefault();
        } else if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) tracking = false;
    }, { passive: false, capture: true });
    document.addEventListener("touchend", (event) => {
        if (!tracking || !mobileQuery.matches || !horizontal) { tracking = false; horizontal = false; return; }
        const t = event.changedTouches[0], dx = t.clientX - startX;
        if (dx > 60 && !dashboard?.classList.contains("mobile-nav-open")) setMobileSidebar(true);
        // Closing is by tap on backdrop; a swipe-left is not required.
        tracking = false; horizontal = false;
    }, { passive: true, capture: true });
    document.addEventListener("touchcancel", () => { tracking = false; horizontal = false; }, { passive: true, capture: true });
})();
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
    restoreCreatedServerVoiceMedia();
    activeCreatedServerVoiceChannel = null;
    const connectionPanel = document.getElementById("createdServerVoiceConnectionPanel");
    if (connectionPanel) connectionPanel.hidden = true;
    createdServerSidebarVoiceStops.forEach(stop => stop?.());
    createdServerSidebarVoiceStops.clear();
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
    const supportBotView = document.getElementById("supportBotView");
    if (supportBotView) supportBotView.hidden = true;
}

function clearServerSelections() {
    document.querySelectorAll(".server-icon").forEach((icon) => {
        icon.classList.remove("selected");
        icon.setAttribute("aria-pressed", "false");
    });
}

function showLoungeSidebar() {
    placeProfileCardInVisibleSidebar(false);
    const channelsSidebar = document.getElementById("channelsSidebar");
    if (channelsSidebar) channelsSidebar.hidden = false;
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
    updateCreatedServerVoiceUI();
}

// ==================================================
// TEXT CHANNELS
// ==================================================

function openTextChannel(channelName) {
    if (!currentUser || !channelName) return;
    setMobileSidebar(false);
    const returningFromPrimaryVoice = Boolean(primaryVoiceChannelName);
    if (returningFromPrimaryVoice) closePrimaryVoiceCallView();

    // Release created-server channel listeners when returning to VIP-LOUNGE.
    stopCreatedServerChannels();

    stopDirectMessages();

    activeCreatedServerId = null;
    showLoungeSidebar();
    hideMainViews();
    // Restore the created-server panel to its own view so VIP-LOUNGE keeps its independent sidebar.
    syncCreatedServerPanelLayout();

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
    // Selection closes the navigation drawer on small screens.
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
        const destination = window.location.pathname + window.location.search + window.location.hash;
        const loginUrl = new URL("login.html", window.location.href);
        loginUrl.searchParams.set("redirect", destination);
        window.location.replace(loginUrl.toString());
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

    // Start members in the default VIP-LOUNGE server and its general channel.
    stopCreatedServerChannels();
    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    activeCreatedServerId = null;
    selectedMember = null;
    currentConversationId = null;

    if (pendingInviteServer) {
        const invitedServer = pendingInviteServer;
        pendingInviteServer = null;
        openServer(invitedServer);
    } else {
        openTextChannel("general");
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
    placeProfileCardInVisibleSidebar(false);
    const channelsSidebar = document.getElementById("channelsSidebar");
    if (channelsSidebar) channelsSidebar.hidden = false;

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
    // Restore the original second-column layout for Direct Messages after created-server navigation was moved.
    syncCreatedServerPanelLayout();

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
    updateCreatedServerVoiceUI();
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

    // Do not close the navigation drawer when switching between DM and servers.
});

mainServerButton?.addEventListener("click", () => {
    // Return to the default VIP-LOUNGE and open its general channel,
    // rather than leaving the main content area blank.
    openTextChannel("general");
    if (mainServerButton) {
        mainServerButton.classList.add("selected");
        mainServerButton.setAttribute("aria-pressed", "true");
    }
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
        button.className = "text-channel dm-channel-entry";

        if (selectedMember?.uid === member.uid) {
            button.classList.add("selected");
        }

        const name = document.createElement("span");
        name.className = "dm-channel-name";
        name.textContent = member.displayName;

        button.append(name);

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
    setMobileSidebar(false);

    stopDirectMessages();

    activeCreatedServerId = null;
    selectedMember = member;
    window.dmCallContactGetter = () => selectedMember;

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
    // Keep the sidebar open when a private conversation is selected.

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
            "viewChannels",
            "sendMessages",
            "connectVoice",
            "speak",
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
            "viewChannels",
            "sendMessages",
            "connectVoice",
            "speak",
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

    createdServerVoicePresenceStop?.();
    createdServerVoicePresenceStop = null;
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
            // Ignore late errors from a server that is no longer active.
            if (activeCreatedServerId !== serverId) return;
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
    if (!createdServerTextChannels) return;
    createdServerSidebarVoiceStops.forEach(stop => stop?.());
    createdServerSidebarVoiceStops.clear();
    createdServerTextChannels.replaceChildren();

    const categories = createdServerChannels.filter(channel => channel.type === "category");
    const channelItems = createdServerChannels.filter(channel =>
        channel.type === "text" || channel.type === "voice"
    );
    const voices = channelItems.filter(channel => channel.type === "voice");
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

        if (channel.type === "voice") {
            const sidebarMembers = document.createElement("div");
            sidebarMembers.className = "created-server-voice-sidebar-members";
            sidebarMembers.setAttribute("aria-label", "People in this voice channel");
            li.append(sidebarMembers);

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

    function appendCategoryHeading(category) {
        const heading = document.createElement("li");
        heading.className = "created-server-category-heading";

        const label = document.createElement("span");
        label.textContent = category.name.toUpperCase();
        heading.append(label);

        if (canManageChannels) {
            const actions = document.createElement("span");
            actions.className = "created-server-category-actions";

            const add = document.createElement("button");
            add.type = "button";
            add.className = "created-server-category-add";
            add.textContent = "+";
            add.title = `Add a text or voice channel to ${category.name}`;
            add.setAttribute("aria-label", `Add a channel to ${category.name}`);
            add.onclick = event => {
                event.stopPropagation();
                void createCreatedServerChannel(null, category.id);
            };

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "created-server-channel-delete";
            remove.textContent = "×";
            remove.title = "Delete category";
            remove.setAttribute("aria-label", `Delete category ${category.name}`);
            remove.onclick = () => void deleteCreatedServerChannel(category);

            actions.append(add, remove);
            heading.append(actions);
        }

        createdServerTextChannels.append(heading);
    }

    // Channels without a valid category remain at the top.
    channelItems
        .filter(channel => !channel.parentCategoryId ||
            !categories.some(category => category.id === channel.parentCategoryId))
        .forEach(channel => createdServerTextChannels.append(makeChannelRow(channel)));

    // Each category now contains both # text channels and voice channels.
    categories.forEach(category => {
        appendCategoryHeading(category);
        channelItems
            .filter(channel => channel.parentCategoryId === category.id)
            .forEach(channel => {
                const row = makeChannelRow(channel);
                row.classList.add("is-categorized");
                createdServerTextChannels.append(row);
            });
    });

    if (activeCreatedServerId) {
        voices.forEach(channel => {
            const row = [...createdServerTextChannels.querySelectorAll(".created-server-channel-item")]
                .find(item => item.dataset.channelId === channel.id);
            const strip = row?.querySelector(".created-server-voice-sidebar-members");
            const stop = strip && window.diamondWatchCreatedVoiceSidebarRoom?.(
                "cs-" + activeCreatedServerId + "-" + channel.id,
                strip
            );
            if (typeof stop === "function") {
                createdServerSidebarVoiceStops.set(channel.id, stop);
            }
        });
    }
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
    setMobileSidebar(false);

    if (channel.type !== "text") return;

    activeCreatedServerVoiceChannel = null;
    restoreCreatedServerVoiceMedia();
    createdServerMessages?.classList.remove("is-voice-call-view");
    document.querySelector(".created-server-chat-header")?.classList.remove("is-voice-header");
    const voiceChatButton = document.getElementById("createdServerHeaderChatButton");
    if (voiceChatButton) voiceChatButton.hidden = true;
    const membersButton = document.querySelector(".created-server-header-members");
    if (membersButton) membersButton.hidden = false;

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
    if (createdServerMessageForm) createdServerMessageForm.hidden = false;
    if (createdServerMessageStatus) createdServerMessageStatus.hidden = false;

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
            // Prevent a stale listener from replacing the UI after navigation.
            if (
                activeCreatedServerId !== serverId ||
                activeCreatedServerChannelId !== channelId
            ) {
                return;
            }
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

function restoreCreatedServerVoiceMedia() {
    const main = document.querySelector("main");
    const remoteVideoGrid = document.getElementById("remoteVideoGrid");
    const screenShareStage = document.getElementById("screenShareStage");
    if (main && remoteVideoGrid && remoteVideoGrid.parentElement !== main) {
        main.append(remoteVideoGrid);
    }
    if (main && screenShareStage && screenShareStage.parentElement !== main) {
        main.insertBefore(screenShareStage, document.getElementById("loungeView") || null);
    }
    createdServerRemoteMediaLayer = null;
}

function placeProfileCardInVisibleSidebar(serverViewActive = false) {
    const card = document.querySelector(".profile-card");
    const globalSidebar = document.getElementById("channelsSidebar");
    const serverPanel = document.querySelector(".created-server-channel-panel");
    const destination = serverViewActive ? serverPanel : globalSidebar;
    if (card && destination && card.parentElement !== destination) {
        destination.append(card);
    }
}

function syncCreatedServerVoiceUser() {
    const panels = [
        ["createdServerVoiceUserAvatar", "createdServerVoiceUserName", "createdServerVoiceUserSubline", "createdServerVoiceUserBadges"],
        ["mainVoiceUserAvatar", "mainVoiceUserName", "mainVoiceUserSubline", "mainVoiceUserBadges"]
    ];
    panels.forEach(([avatarId, nameId, sublineId, badgesId]) => {
        const avatar = document.getElementById(avatarId);
        const name = document.getElementById(nameId);
        const subline = document.getElementById(sublineId);
        const badges = document.getElementById(badgesId);
        if (name) name.textContent =
            profileName?.textContent?.trim() ||
            currentUser?.displayName ||
            currentUser?.email?.split("@")[0] ||
            "Member";
        if (subline) subline.textContent =
            window.diamondVoiceControls?.getState?.().serverName ||
            serverViewName?.textContent?.trim() || "VIP-LOUNGE";
        if (badges) {
            badges.replaceChildren();
            currentProfileBadges.slice(0, 2).forEach(label => {
                const chip = document.createElement("span");
                chip.textContent = label;
                badges.append(chip);
            });
        }
        if (avatar) {
            avatar.replaceChildren();
            if (uploadedPicture) {
                const image = document.createElement("img");
                image.src = uploadedPicture;
                image.alt = "";
                avatar.append(image);
                avatar.classList.add("has-picture");
            } else {
                avatar.classList.remove("has-picture");
                const preset = AVATAR_STYLES[currentAvatar] || AVATAR_STYLES.diamond;
                avatar.style.background = preset.background;
                avatar.style.color = preset.color;
                avatar.textContent = currentAvatar === "diamond" ? "✦" : preset.glyph;
            }
        }
    });
}

function updateCreatedServerVoiceUI(state = window.diamondVoiceControls?.getState?.() || {}) {
    const createdPanel = document.getElementById("createdServerVoiceConnectionPanel");
    const createdState = document.getElementById("createdServerVoiceConnectionState");
    const createdRoom = document.getElementById("createdServerVoiceConnectionRoom");
    const mainPanel = document.getElementById("mainVoiceConnectionPanel");
    const mainState = document.getElementById("mainVoiceConnectionState");
    const mainRoom = document.getElementById("mainVoiceConnectionRoom");

    const isCreatedRoom = Boolean(state.roomId && state.roomId.startsWith("cs-"));
    const connectedOrJoining = Boolean(state.connected);
    const isViewingJoinedServer = Boolean(activeCreatedServerId && serverView && !serverView.hidden);
    const showCreatedPanel = isViewingJoinedServer && connectedOrJoining;
    // When the server workspace is open, its sidebar owns the dock. Otherwise use the global sidebar.
    const showMainPanel = connectedOrJoining && !showCreatedPanel;

    if (createdPanel) createdPanel.hidden = !showCreatedPanel;
    if (createdState) createdState.textContent = state.joining && !state.connected ? "Connecting..." : "Voice Connected";
    if (createdRoom) createdRoom.textContent = showCreatedPanel
        ? (state.selectedChannel || activeCreatedServerVoiceChannel?.name || "VOICE CHANNEL") +
            " / " + (state.serverName || serverViewName?.textContent?.trim() || "DIAMOND LOUNGE")
        : "";

    if (mainPanel) mainPanel.hidden = !showMainPanel;
    if (mainState) mainState.textContent = state.joining && !state.connected ? "Connecting..." : "Voice Connected";
    if (mainRoom) mainRoom.textContent = showMainPanel
        ? (state.selectedChannel || primaryVoiceChannelName || "VOICE CHANNEL") +
            " / " + (state.serverName || "VIP-LOUNGE")
        : "";

    document.getElementById("channelsSidebar")?.classList.toggle("has-voice-connection", showMainPanel);
    document.querySelector(".created-server-channel-panel")
        ?.classList.toggle("has-voice-connection", showCreatedPanel);

    document.querySelectorAll('[data-voice-action="mute"]').forEach(button => {
        button.setAttribute("aria-pressed", String(Boolean(state.muted)));
        button.title = state.muted ? "Unmute microphone" : "Mute microphone";
        button.textContent = state.muted ? "⊘⌄" : "♩⌄";
    });
    document.querySelectorAll('[data-voice-action="deafen"]').forEach(button => {
        button.setAttribute("aria-pressed", String(Boolean(state.deafened)));
        button.title = state.deafened ? "Turn audio on" : "Deafen";
        button.textContent = state.deafened ? "◉⌄" : "◖⌄";
    });
    document.querySelectorAll('[data-voice-action="camera"]').forEach(button => {
        button.setAttribute("aria-pressed", String(Boolean(state.cameraOn)));
        button.title = state.cameraOn ? "Turn camera off" : "Turn camera on";
    });
    document.querySelectorAll('[data-voice-action="screen"]').forEach(button => {
        button.setAttribute("aria-pressed", String(Boolean(state.screenOn)));
        button.title = state.screenOn ? "Stop sharing screen" : "Share screen";
    });
    document.querySelectorAll('[data-voice-action="hand"]').forEach(button => {
        button.setAttribute("aria-pressed", String(Boolean(state.raisedHand)));
        button.title = state.raisedHand ? "Lower hand" : "Raise hand";
    });

    document.querySelectorAll(".created-server-voice-join").forEach(button => {
        button.hidden = Boolean(state.connected || state.joining);
        button.disabled = Boolean(state.joining);
        button.textContent = state.joining ? "Connecting..." : "Join Voice";
    });
    document.querySelectorAll(".created-server-voice-leave").forEach(button => {
        button.disabled = !state.connected && !state.joining;
    });
    document.querySelectorAll(".created-server-voice-call-status").forEach(callStatus => {
        callStatus.textContent = state.connected
            ? (state.muted ? "Microphone muted" : "Voice connected")
            : state.joining ? "Connecting to voice..." : "You're not connected yet";
    });
}

window.addEventListener("diamond-voice-state", event => {
    updateCreatedServerVoiceUI(event.detail || {});
});

function makeCreatedServerVoiceButton(action, icon, label, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = ("created-server-voice-tool " + className).trim();
    button.dataset.voiceAction = action;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = '<span aria-hidden="true">' + icon + '</span><small>' + label + '</small>';
    return button;
}

function openCreatedServerVoiceSettings() {
    const content = serverFeatureDialog("Voice Settings");
    content.append(sfNode("p", "Adjust the volume of other people in this voice room."));
    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.value = String(Math.round((window.diamondVoiceControls?.getState?.().outputVolume ?? 1) * 100));
    const value = sfNode("span", volume.value + "%");
    volume.oninput = () => {
        value.textContent = volume.value + "%";
        window.diamondVoiceControls?.setOutputVolume?.(Number(volume.value) / 100);
    };
    content.append(sfNode("label", "Output volume"), volume, value);
}

function openCreatedServerVoiceActivities() {
    const content = serverFeatureDialog("Voice Activities");
    content.append(sfNode("p", "Quick actions while you're hanging out in voice."));
    const hand = sfNode("button", window.diamondVoiceControls?.getState?.().raisedHand ? "Lower hand" : "Raise hand");
    hand.className = "created-server-feature-action";
    hand.onclick = () => {
        window.diamondVoiceControls?.toggleRaiseHand?.();
        hand.textContent = window.diamondVoiceControls?.getState?.().raisedHand ? "Lower hand" : "Raise hand";
    };
    const chat = sfNode("button", "Open voice channel chat");
    chat.className = "created-server-feature-action";
    chat.onclick = () => {
        document.getElementById("serverFeatureDialog")?.remove();
        if (activeCreatedServerVoiceChannel) {
            void openCreatedServerVoiceChat(activeCreatedServerVoiceChannel);
        }
    };
    content.append(hand, chat);
}

function closePrimaryVoiceCallView() {
    primaryVoicePresenceStop?.();
    primaryVoicePresenceStop = null;
    const callView = document.getElementById("loungeVoiceCallView");
    if (callView) {
        callView.replaceChildren();
        callView.hidden = true;
    }
    loungeView?.classList.remove("is-voice-call");
    const messages = document.getElementById("messages");
    const messageForm = document.getElementById("messageForm");
    const uploadStatus = document.getElementById("uploadStatus");
    if (messages) messages.hidden = false;
    if (messageForm) messageForm.hidden = false;
    if (uploadStatus) uploadStatus.hidden = false;
    const title = document.querySelector("#loungeView .channel-title");
    if (title?.firstChild?.nodeType === 3) title.firstChild.textContent = "# ";
    document.querySelector("#loungeView .chat-header")?.classList.remove("is-voice-header");
    restoreCreatedServerVoiceMedia();
    primaryVoiceChannelName = null;
    primaryVoiceRoomId = null;
    updateCreatedServerVoiceUI();
}

function openPrimaryVoiceCall(channelName, roomId) {
    if (!channelName || !roomId) return;
    createdServerVoicePresenceStop?.();
    createdServerVoicePresenceStop = null;
    activeCreatedServerVoiceChannel = null;
    primaryVoicePresenceStop?.();
    primaryVoicePresenceStop = null;
    restoreCreatedServerVoiceMedia();
    primaryVoiceChannelName = channelName;
    primaryVoiceRoomId = roomId;

    stopDirectMessages();
    activeCreatedServerId = null;
    activeCreatedServerOwnerUid = null;
    currentServerCanManageChannels = false;
    showLoungeSidebar();
    hideMainViews();
    if (loungeView) loungeView.hidden = false;
    if (serverView) serverView.hidden = true;
    if (communitySidebar) communitySidebar.hidden = false;
    clearServerSelections();
    mainServerButton?.classList.add("selected");
    mainServerButton?.setAttribute("aria-pressed", "true");
    setMobileSidebar(false);
    const messages = document.getElementById("messages");
    const messageForm = document.getElementById("messageForm");
    const uploadStatus = document.getElementById("uploadStatus");
    if (messages) messages.hidden = true;
    if (messageForm) messageForm.hidden = true;
    if (uploadStatus) uploadStatus.hidden = true;
    if (activeChannelName) activeChannelName.textContent = channelName;
    if (activeChannelDescription) activeChannelDescription.textContent = "Voice channel";

    const title = document.querySelector("#loungeView .channel-title");
    if (title?.firstChild?.nodeType === 3) title.firstChild.textContent = "◖ ";
    document.querySelector("#loungeView .chat-header")?.classList.add("is-voice-header");

    const callView = document.getElementById("loungeVoiceCallView");
    if (!callView) return;
    callView.replaceChildren();
    callView.hidden = false;
    loungeView?.classList.add("is-voice-call");

    const call = document.createElement("div");
    call.className = "created-server-voice-call";
    call.dataset.channelId = roomId;

    const stage = document.createElement("div");
    stage.className = "created-server-voice-stage";
    stage.id = "loungeVoiceStage";
    stage.setAttribute("aria-label", "People in voice");

    const audience = document.createElement("div");
    audience.className = "created-server-audience";
    audience.hidden = true;

    const mediaLayer = document.createElement("div");
    mediaLayer.className = "created-server-voice-remote-media";
    createdServerRemoteMediaLayer = mediaLayer;
    const remoteVideoGrid = document.getElementById("remoteVideoGrid");
    const screenShareStage = document.getElementById("screenShareStage");
    const main = document.querySelector("main");
    if (remoteVideoGrid && remoteVideoGrid.parentElement !== mediaLayer) {
        remoteVideoGridHomeParent = remoteVideoGrid.parentElement || main;
        mediaLayer.append(remoteVideoGrid);
    }
    if (screenShareStage && screenShareStage.parentElement !== mediaLayer) {
        remoteScreenStageHomeParent = screenShareStage.parentElement || main;
        mediaLayer.append(screenShareStage);
    }

    const status = document.createElement("div");
    status.className = "created-server-voice-call-status";
    status.id = "loungeVoiceCallStatus";
    status.textContent = "You're not connected yet";

    // Voice actions are consolidated into the persistent sidebar Voice Connected dock.
    call.append(stage, mediaLayer, audience, status);
    callView.append(call);
    syncDiscordScreenShareLayout();

    primaryVoicePresenceStop = window.diamondWatchCreatedVoiceRoom?.(roomId, stage, audience, {}) || null;
    syncCreatedServerVoiceUser();
    updateCreatedServerVoiceUI();
}

window.diamondOpenPrimaryVoiceCall = openPrimaryVoiceCall;
window.diamondClosePrimaryVoiceCall = closePrimaryVoiceCallView;

function syncDiscordScreenShareLayout() {
    const screenStage = document.getElementById("screenShareStage");
    const screenContainer = document.getElementById("remoteScreenContainer");
    const active = Boolean(
        screenStage &&
        !screenStage.hidden &&
        screenContainer?.querySelector(".remote-video-screen:not([hidden])")
    );
    document.querySelectorAll(".created-server-voice-call").forEach(call => {
        call.classList.toggle("is-screen-sharing", active);
    });
}

const discordScreenShareObserver = new MutationObserver(syncDiscordScreenShareLayout);
const screenStageForLayout = document.getElementById("screenShareStage");
const screenContainerForLayout = document.getElementById("remoteScreenContainer");
if (screenStageForLayout) {
    discordScreenShareObserver.observe(screenStageForLayout, {
        attributes: true,
        attributeFilter: ["hidden"],
        childList: true,
        subtree: true
    });
}
if (screenContainerForLayout) {
    discordScreenShareObserver.observe(screenContainerForLayout, {
        attributes: true,
        attributeFilter: ["hidden"],
        childList: true,
        subtree: true
    });
}
window.addEventListener("diamond-screen-share-layout", syncDiscordScreenShareLayout);


document.addEventListener("click", event => {
    const button = event.target.closest("[data-voice-action]");
    if (!button) return;
    const action = button.dataset.voiceAction;
    const controls = window.diamondVoiceControls;
    if (!controls && !["join", "leave"].includes(action)) return;

    switch (action) {
        case "join":
            if (activeCreatedServerVoiceChannel && activeCreatedServerId) {
                void window.diamondJoinCreatedVoiceRoom?.(
                    activeCreatedServerVoiceChannel.name,
                    "cs-" + activeCreatedServerId + "-" + activeCreatedServerVoiceChannel.id,
                    serverViewName?.textContent?.trim() || "Diamond Lounge"
                );
            } else if (primaryVoiceChannelName && primaryVoiceRoomId) {
                void window.diamondJoinCreatedVoiceRoom?.(
                    primaryVoiceChannelName, primaryVoiceRoomId, "VIP-LOUNGE"
                );
            }
            break;
        case "leave":
            void window.diamondLeaveVoice?.();
            break;
        case "mute":
            controls?.toggleMute?.();
            break;
        case "deafen":
            controls?.toggleDeafen?.();
            break;
        case "camera":
            void controls?.toggleCamera?.();
            break;
        case "screen":
            void controls?.toggleScreen?.();
            break;
        case "hand":
            void controls?.toggleRaiseHand?.();
            break;
        case "activities":
            openCreatedServerVoiceActivities();
            break;
        case "settings":
            openCreatedServerVoiceSettings();
            break;
    }
});

document.getElementById("createdServerVoiceDisconnect")?.addEventListener("click", () => {
    void window.diamondLeaveVoice?.();
});
document.getElementById("mainVoiceDisconnect")?.addEventListener("click", () => {
    void window.diamondLeaveVoice?.();
});
document.getElementById("mainVoiceUserProfile")?.addEventListener("click", () => {
    profileButton?.click();
});

document.getElementById("createdServerVoiceUserProfile")?.addEventListener("click", () => {
    profileButton?.click();
});

function openCreatedServerVoiceChannel(channel) {
    if (!channel?.id || !activeCreatedServerId) return;
    setMobileSidebar(false);
    stopCreatedServerMessages();
    createdServerVoicePresenceStop?.();
    createdServerVoicePresenceStop = null;

    activeCreatedServerVoiceChannel = channel;
    activeCreatedServerChannelId = channel.id;
    activeCreatedServerChannelType = "voice";

    if (createdServerActiveChannel) createdServerActiveChannel.textContent = channel.name;
    if (createdServerChannelSymbol) createdServerChannelSymbol.textContent = "◖";
    if (createdServerMessageInput) {
        createdServerMessageInput.disabled = true;
        createdServerMessageInput.placeholder = "Voice channels use the voice chat panel.";
    }
    if (createdServerSendButton) createdServerSendButton.disabled = true;
    if (createdServerMessageForm) createdServerMessageForm.hidden = true;
    if (createdServerMessageStatus) createdServerMessageStatus.hidden = true;

    const chatHeader = document.querySelector(".created-server-chat-header");
    chatHeader?.classList.add("is-voice-header");
    const chatButton = document.getElementById("createdServerHeaderChatButton");
    const memberButton = document.querySelector(".created-server-header-members");
    if (chatButton) chatButton.hidden = false;
    if (memberButton) memberButton.hidden = true;
    if (chatButton) chatButton.onclick = () => void openCreatedServerVoiceChat(channel);

    renderCreatedServerChannels();

    if (createdServerMessages) {
        createdServerMessages.replaceChildren();
        createdServerMessages.classList.add("is-voice-call-view");

        const call = document.createElement("div");
        call.className = "created-server-voice-call";
        call.dataset.channelId = channel.id;

        const stage = document.createElement("div");
        stage.className = "created-server-voice-stage created-server-voice-stage-mobile";
        stage.id = "createdServerVoiceStage";
        stage.setAttribute("aria-label", "People in voice");

        const audience = document.createElement("div");
        audience.className = "created-server-audience";
        audience.hidden = true;

        const mediaLayer = document.createElement("div");
        mediaLayer.className = "created-server-voice-remote-media";
        createdServerRemoteMediaLayer = mediaLayer;

        const remoteVideoGrid = document.getElementById("remoteVideoGrid");
        const screenShareStage = document.getElementById("screenShareStage");
        const main = document.querySelector("main");
        if (remoteVideoGrid && remoteVideoGrid.parentElement !== mediaLayer) {
            remoteVideoGridHomeParent = remoteVideoGrid.parentElement || main;
            mediaLayer.append(remoteVideoGrid);
        }
        if (screenShareStage && screenShareStage.parentElement !== mediaLayer) {
            remoteScreenStageHomeParent = screenShareStage.parentElement || main;
            mediaLayer.append(screenShareStage);
        }

        const status = document.createElement("div");
        status.className = "created-server-voice-call-status";
        status.id = "createdServerVoiceCallStatus";
        status.textContent = "You're not connected yet";

        // Voice actions live in the sidebar connection dock, not a duplicate call toolbar.
        call.append(stage, mediaLayer, audience, status);
        createdServerMessages.append(call);
        syncDiscordScreenShareLayout();
    }

    createdServerVoicePresenceStop = window.diamondWatchCreatedVoiceRoom?.(
        "cs-" + activeCreatedServerId + "-" + channel.id,
        document.getElementById("createdServerVoiceStage"),
        document.querySelector(".created-server-audience"),
        { serverId: activeCreatedServerId, channelId: channel.id }
) || null;

    syncCreatedServerVoiceUser();
    updateCreatedServerVoiceUI();

    // Selecting the voice-channel row immediately joins the room.
    void window.diamondJoinCreatedVoiceRoom?.(
        channel.name,
        "cs-" + activeCreatedServerId + "-" + channel.id,
        serverViewName?.textContent?.trim() || "Diamond Lounge"
    );
}

async function createCreatedServerChannel(typeOverride = null, parentCategoryIdOverride = null) {
    if (!currentUser || !activeCreatedServerId) return;
    if (!(await currentServerHasPermission("manageChannels"))) {
        alert("You need the Manage Channels role permission to create channels.");
        return;
    }

    const serverId = activeCreatedServerId;
    let type = typeOverride;

    if (!type) {
        const typeInput = prompt("Create a text or voice channel? Enter text or voice:", "text");
        if (typeInput === null) return;
        type = typeInput.trim().toLowerCase();
    }
    if (!["text", "voice", "category"].includes(type)) {
        alert("Choose text, voice, or category.");
        return;
    }

    const nameInput = prompt(
        type === "category" ? "Enter the category name:" :
        type === "voice" ? "Enter the voice channel name:" :
        "Enter the text channel name:"
    );
    if (nameInput === null) return;

    const name = nameInput.trim();
    if (name.length < 1 || name.length > 40) {
        alert("Names must be between 1 and 40 characters.");
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
        const availableCategories = createdServerChannels.filter(channel =>
            channel.type === "category"
        );

        if (parentCategoryIdOverride) {
            const selectedCategory = availableCategories.find(category =>
                category.id === parentCategoryIdOverride
            );
            if (!selectedCategory) {
                alert("That category no longer exists. Refresh the server channel list and try again.");
                return;
            }
            parentCategoryId = selectedCategory.id;
        } else if (availableCategories.length) {
            const choices = availableCategories.map((category, index) =>
                `${index + 1}. ${category.name}`
            ).join("\n");
            const answer = prompt(
                `Place this channel under a category by entering its number, or leave blank for no category:\n${choices}`,
                ""
            );
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
        const channelData = {
            name,
            nameLower,
            type,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        };
        if (parentCategoryId) channelData.parentCategoryId = parentCategoryId;

        const channelRef = await addDoc(
            collection(db, "servers", serverId, "channels"),
            channelData
        );

        if (activeCreatedServerId === serverId && type === "text") {
            openCreatedServerChannel({
                id: channelRef.id,
                ...channelData,
                createdAt: null
            });
        }
    } catch (error) {
        console.error("Channel creation failed:", error);
        alert(error.code === "permission-denied"
            ? "Firebase denied channel creation. Check your Firestore rules and the server's Manage Channels permission."
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
async function serverInviteDialog(channel=null){
    if(!currentUser||!activeCreatedServerId)return;
    const serverId=activeCreatedServerId;
    const dialog=serverFeatureDialog("Invite Friends");
    const description=sfNode("p",channel
        ?"This invite opens directly into the selected voice channel."
        :"This invite opens the server.");
    dialog.append(description);
    const area=document.createElement("div");
    area.className="created-server-invite-link-area";
    area.textContent="Generating invite link…";
    dialog.append(area);

    try{
        const code=(crypto.randomUUID?.()||Date.now()+"-"+Math.random())
            .replace(/-/g,"").slice(0,20);
        await setDoc(doc(db,"servers",serverId,"invites",code),{
            code,
            createdBy:currentUser.uid,
            createdAt:serverTimestamp(),
            channelId:channel?.id||null
        });
        if(activeCreatedServerId!==serverId)return;
        const url=new URL(location.href);
        url.searchParams.set("serverInvite",serverId);
        url.searchParams.set("invite",code);
        url.searchParams.delete("inviteChannel");
        if(channel)url.searchParams.set("inviteChannel",channel.id);
        area.replaceChildren();
        const input=document.createElement("input");
        input.readOnly=true;
        input.value=url.href;
        input.setAttribute("aria-label","Invite link");
        const copy=sfNode("button","Copy");
        copy.className="created-server-feature-action";
        copy.onclick=async()=>{
            try{
                await navigator.clipboard.writeText(input.value);
                copy.textContent="Copied!";
            }catch{
                input.select();
                try{
                    document.execCommand("copy");
                    copy.textContent="Copied!";
                }catch{
                    copy.textContent="Copy failed";
                }
            }
        };
        area.append(input,copy);
    }catch(error){
        console.error("Invite creation failed:",error);
        area.replaceChildren();
        const message=sfNode("p","Invite link failed: "+(error?.code||"unknown error")+" — "+(error?.message||"Please try again."));
        message.style.color="#ed4245";
        area.append(message);
    }
}
async function serverVoiceChannelSettings(channel){if(!currentUser||!activeCreatedServerId)return;const c=serverFeatureDialog("Voice Channel Settings");const label=sfNode("label","Channel name");const input=document.createElement("input");input.value=channel.name||"";input.maxLength=40;c.append(label,input);const save=sfNode("button","Save");save.className="created-server-feature-action";c.append(save);save.onclick=async()=>{try{await updateDoc(doc(db,"servers",activeCreatedServerId,"channels",channel.id),{name:input.value.trim(),nameLower:normalizeServerName(input.value)});channel.name=input.value.trim();renderCreatedServerChannels();if(activeCreatedServerChannelId===channel.id&&createdServerActiveChannel)createdServerActiveChannel.textContent=channel.name;save.textContent="Saved";}catch(e){alert("Channel update failed. Check Firebase rules.");}};if(currentServerCanManageChannels||activeCreatedServerOwnerUid===currentUser.uid){const del=sfNode("button","Delete channel");del.className="created-server-feature-action";del.style.background="#ed4245";c.append(del);del.onclick=()=>{if(confirm("Delete this voice channel?"))void deleteCreatedServerChannel(channel);};}}
async function openCreatedServerVoiceChat(channel){if(!currentUser||!activeCreatedServerId)return;const c=serverFeatureDialog(channel.name+" — Chat");c.className="created-server-feature-content created-server-voice-chat-content";const log=document.createElement("div");log.className="created-server-voice-chat-log";c.append(log);const form=document.createElement("form");form.className="created-server-voice-chat-form";const input=document.createElement("input");input.placeholder="Message #"+channel.name;input.maxLength=2000;input.required=true;const send=sfNode("button","Send");send.className="created-server-feature-action";form.append(input,send);c.append(form);const ref=collection(db,"servers",activeCreatedServerId,"channels",channel.id,"messages");const unsub=onSnapshot(query(ref,orderBy("timestamp","asc")),snap=>{log.replaceChildren();snap.forEach(d=>{const data=d.data(),row=document.createElement("div");row.className="created-server-voice-chat-message";const name=sfNode("strong",data.displayName||data.username||"Member");const body=sfNode("span",data.text||"");row.append(name,body);log.append(row);});log.scrollTop=log.scrollHeight;},e=>{console.error(e);log.textContent="Chat could not be loaded. Firebase rules may need updating.";});form.onsubmit=async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;send.disabled=true;try{await addDoc(ref,{uid:currentUser.uid,displayName:currentUser.displayName||currentUser.email?.split("@")[0]||"Member",text,timestamp:serverTimestamp()});input.value="";}catch(e){console.error(e);alert("Message failed to send. Firebase rules may need updating.");}finally{send.disabled=false;}};const modal=document.getElementById("serverFeatureDialog");modal?.querySelector(".created-server-feature-close")?.addEventListener("click",unsub,{once:true});modal?.addEventListener("DOMNodeRemoved",unsub,{once:true});}
function cropServerImage(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);
        image.onload = () => {
            const overlay = document.createElement("div");
            overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:18px;";
            const panel = document.createElement("div");
            panel.style.cssText = "width:min(440px,100%);background:#17181c;border:1px solid rgba(199,169,107,.35);border-radius:20px;padding:20px;box-shadow:0 24px 80px #000;display:grid;gap:14px;";
            const title = sfNode("h2","Crop server picture"); title.style.margin="0";
            const canvas=document.createElement("canvas"); canvas.width=320;canvas.height=320;
            canvas.style.cssText="width:min(320px,100%);aspect-ratio:1;border-radius:16px;background:#111;cursor:grab;touch-action:none;justify-self:center;";
            const ctx=canvas.getContext("2d");
            const zoom=document.createElement("input");zoom.type="range";zoom.min="1";zoom.max="3";zoom.step=".01";zoom.value="1";
            const hint=sfNode("small","Drag the image to reposition. Zoom to adjust.");hint.style.color="#aaa";
            const actions=document.createElement("div");actions.style.cssText="display:flex;justify-content:flex-end;gap:10px;";
            const cancel=sfNode("button","Cancel");const apply=sfNode("button","Use crop");
            apply.style.cssText="padding:10px 16px;border-radius:12px;background:#c7a96b;color:#111;border:0;font-weight:700;cursor:pointer;";
            cancel.style.cssText="padding:10px 16px;border-radius:12px;background:#28292e;border:1px solid #444;cursor:pointer;";
            actions.append(cancel,apply);panel.append(title,canvas,hint,sfNode("label","Zoom"),zoom,actions);overlay.append(panel);document.body.append(overlay);
            let factor=1,offsetX=0,offsetY=0,drag=false,lastX=0,lastY=0;
            const base=Math.max(canvas.width/image.width,canvas.height/image.height);
            function draw(){
                ctx.clearRect(0,0,canvas.width,canvas.height);
                const w=image.width*base*factor,h=image.height*base*factor;
                offsetX=Math.min(0,Math.max(canvas.width-w,offsetX));offsetY=Math.min(0,Math.max(canvas.height-h,offsetY));
                ctx.drawImage(image,offsetX,offsetY,w,h);
            }
            factor=1;offsetX=(canvas.width-image.width*base)/2;offsetY=(canvas.height-image.height*base)/2;draw();
            zoom.oninput=()=>{factor=Number(zoom.value);offsetX=(canvas.width-image.width*base*factor)/2;offsetY=(canvas.height-image.height*base*factor)/2;draw();};
            canvas.onpointerdown=e=>{drag=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);canvas.style.cursor="grabbing";};
            canvas.onpointermove=e=>{if(!drag)return;offsetX+=e.clientX-lastX;offsetY+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;draw();};
            canvas.onpointerup=canvas.onpointercancel=()=>{drag=false;canvas.style.cursor="grab";};
            cancel.onclick=()=>{overlay.remove();URL.revokeObjectURL(objectUrl);resolve(null);};
            apply.onclick=()=>canvas.toBlob(blob=>{overlay.remove();URL.revokeObjectURL(objectUrl);blob?resolve(blob):reject(new Error("Crop could not be saved."));},"image/jpeg",0.82);
        };
        image.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error("Image could not be opened."));};
        image.src=objectUrl;
    });
}

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
    iconFile.accept = "image/png,image/jpeg,image/webp";
    const iconPreview = document.createElement("img");
    iconPreview.alt = "Server icon preview";
    iconPreview.style.cssText = "width:88px;height:88px;object-fit:cover;border-radius:20px;display:block;background:#222;";
    iconPreview.src = data.iconUrl || "";
    const visibility = document.createElement("select");
    ["private", "public"].forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        visibility.append(option);
    });
    visibility.value = data.visibility || "private";
    let croppedBlob = null;
    let previewUrl = null;
    iconFile.addEventListener("change", async () => {
        const file = iconFile.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
            alert("Choose an image smaller than 8 MB.");
            iconFile.value = "";
            return;
        }
        try {
            croppedBlob = await cropServerImage(file);
            if (croppedBlob) {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                previewUrl = URL.createObjectURL(croppedBlob);
                iconPreview.src = previewUrl;
                iconInput.value = "";
            }
        } catch (error) {
            alert(error.message || "Crop failed.");
        }
    });
    content.append(
        sfNode("label", "Server name"), nameInput,
        sfNode("label", "Server picture"), iconPreview, iconFile,
        sfNode("small", "Upload a picture, then crop and zoom it before saving."),
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
        if (name.length < 2 || name.length > 40) {
            alert("Server name must be between 2 and 40 characters.");
            return;
        }
        if (iconUrl && !/^https?:\/\//i.test(iconUrl) && !iconUrl.startsWith("data:image/")) {
            alert("Server icon URL must start with http:// or https://.");
            return;
        }
        save.disabled = true;
        save.textContent = croppedBlob ? "Preparing picture..." : "Saving...";
        try {
            if (croppedBlob) {
                // Store a compact image data URL directly in the server document,
                // avoiding Firebase Storage and its billing requirement.
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error("Picture could not be prepared."));
                    reader.readAsDataURL(croppedBlob);
                });
                if (typeof dataUrl !== "string" || dataUrl.length > 700000) {
                    throw new Error("The cropped picture is too large to save. Try a smaller or simpler image.");
                }
                iconUrl = dataUrl;
            }
            await updateDoc(doc(db, "servers", serverId), {
                name, nameLower: normalizeServerName(name), visibility: visibility.value, iconUrl
            });
            if (serverViewName) serverViewName.textContent = name;
            if (serverWelcomeName) serverWelcomeName.textContent = name;
            const menuName = document.getElementById("createdServerMenuName");
            if (menuName) menuName.textContent = name;
            await loadServerIcons();
            save.textContent = "Saved";
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        } catch (error) {
            console.error("Server settings save failed:", error);
            alert(error.code === "permission-denied"
                ? "Firebase denied this change. Check the server document Firestore rules."
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
                let hasMemberRecord = memberSnapshot.exists();
                const row = document.createElement("section");
                row.style.padding = "12px";
                row.style.borderRadius = "9px";
                row.style.background = "#232428";
                const heading = sfNode("strong",
                    userData.displayName || userData.name ||
                    (uid === activeCreatedServerOwnerUid ? "Server Owner" : "Member"));
                if (uid === activeCreatedServerOwnerUid) heading.textContent += " · Owner";
                row.append(heading);

                if (canManageMembers && uid !== activeCreatedServerOwnerUid) {
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
                            const permissions = new Set(["viewChannels", "sendMessages", "connectVoice", "speak"]);
                            checks.filter(item => item.checkbox.checked).forEach(item => {
                                (Array.isArray(item.role.permissions) ? item.role.permissions : [])
                                    .forEach(permission => permissions.add(permission));
                            });
                            const memberRef = doc(db, "servers", serverId, "members", uid);
                            const roleUpdate = { roleIds, permissions: [...permissions] };
                            if (hasMemberRecord) {
                                await updateDoc(memberRef, roleUpdate);
                            } else {
                                await setDoc(memberRef, {
                                    uid,
                                    displayName: userData.displayName || userData.name || "Member",
                                    ...roleUpdate,
                                    joinedAt: serverTimestamp()
                                });
                                hasMemberRecord = true;
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
    syncCreatedServerPanelLayout();
    if (!server?.id) return;
    if (primaryVoiceChannelName) closePrimaryVoiceCallView();
    const channelsSidebar = document.getElementById("channelsSidebar");
    // On mobile, this is the drawer's second column and must stay visible
    // while the created-server channel panel is moved into it.
    if (channelsSidebar) channelsSidebar.hidden = !window.matchMedia("(max-width: 900px)").matches;
    placeProfileCardInVisibleSidebar(true);
    restoreCreatedServerVoiceMedia();

    stopPublicMessages();
    stopDirectMessages();

    activeTextChannel = null;
    selectedMember = null;
    currentConversationId = null;
    activeCreatedServerId = server.id;
activeCreatedServerRecord = server;
activeCreatedServerOwnerUid = server.ownerUid || null;
applyServerAppearanceTheme(server.appearanceTheme || "midnight");
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

    updateCreatedServerVoiceUI();
    syncCreatedServerPanelLayout();
    // Selecting a server should not dismiss the mobile navigation panel.
}

function closeServerContextMenu() {
    serverContextMenu?.remove();
    serverContextMenu = null;
}

function showServerContextMenu(event, server) {
    if (!server?.id || !currentUser) return;
    event.preventDefault();
    closeServerContextMenu();

    const menu = document.createElement("div");
    menu.className = "server-context-menu dl-context-menu";
    menu.setAttribute("role", "menu");

    const addItem = (label, action, danger = false) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "dl-context-item" + (danger ? " danger" : "");
        item.setAttribute("role", "menuitem");
        item.textContent = label;
        item.addEventListener("click", () => {
            closeServerContextMenu();
            action();
        });
        menu.appendChild(item);
    };

    addItem("Mark as Read", () => openServer(server));
    addItem("Invite People", () => void serverInviteDialog(server));
    if (server.ownerUid === currentUser.uid || currentServerHasPermission("manageChannels")) {
        addItem("Create Channel", () => {
            openServer(server);
            setTimeout(() => void createCreatedServerChannel(), 150);
        });
    }
    addItem("Copy Server ID", () => {
        void navigator.clipboard?.writeText(String(server.id));
    });
    if (server.ownerUid === currentUser.uid) {
        addItem("Delete Server", () => void deleteServer(server), true);
    }

    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - 220))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - 220))}px`;
    document.body.appendChild(menu);
    serverContextMenu = menu;
    document.addEventListener("click", closeServerContextMenu, { once: true });
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
    if (typeof server.iconUrl === "string" && server.iconUrl.trim()) {
        const img = document.createElement("img");
        img.src = server.iconUrl;
        img.alt = "";
        img.draggable = false;
        img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;";
        img.addEventListener("error", () => {
            img.remove();
            icon.style.overflow = "visible";
            icon.textContent = server.name.trim().charAt(0).toUpperCase();
        }, { once: true });
        icon.style.overflow = "hidden";
        icon.replaceChildren(img);
    } else {
        icon.textContent = server.name.trim().charAt(0).toUpperCase();
    }

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
                    appearanceTheme: data.appearanceTheme || "midnight",
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
    applyProfileCosmetics();
}

async function loadProfile() {
    if (!currentUser) return;
    let purchasedSilverGif = false;
    try {
        const ent = await getDoc(doc(db, "premiumEntitlements", currentUser.uid));
        purchasedSilverGif = ent.exists() && ent.data().silverGifPack === true;
    } catch (_) {}
    silverGifEntitled = isDiamondLoungeOwner() || purchasedSilverGif;
    syncCustomizationShopOwnerState();
    const uploadLabel = document.querySelector('label[for="profileUploadInput"]');
    if (uploadLabel) uploadLabel.textContent = silverGifEntitled ? "Upload your own picture or Silver GIF" : "Upload your own picture";

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
        currentProfileBadges = Array.isArray(data.badges)
            ? data.badges.map(value => String(value).trim()).filter(Boolean).slice(0, 4)
            : [];
        currentProfileCosmetics = normalizeProfileCosmetics(data.cosmetics);
        selectedProfileCosmetics = {
            ...currentProfileCosmetics,
            badges: [...currentProfileCosmetics.badges]
        };
        syncCreatedServerVoiceUser();

        applyAvatar(
            typeof data.avatar === "string" ? data.avatar : "diamond"
        );
        applyProfileCosmetics();
        renderCosmeticPickers();
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
    if (profileBadgesInput) {
        profileBadgesInput.value = currentProfileBadges.join(", ");
    }
    selectedProfileCosmetics = {
        ...currentProfileCosmetics,
        badges: [...currentProfileCosmetics.badges]
    };
    renderCosmeticPickers();
    applyProfileCosmetics();

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
    selectedProfileCosmetics = {
        ...currentProfileCosmetics,
        badges: [...currentProfileCosmetics.badges]
    };
    applyProfileCosmetics();

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

document.getElementById("resetProfilePicture")?.addEventListener("click", () => {
    uploadedPicture = "";
    rawPicture = "";
    pendingGifFile = null;
    if (profileUploadInput) profileUploadInput.value = "";
    if (profileCrop) profileCrop.hidden = true;
    if (cropZoom) cropZoom.value = "100";
    cropScale = 1; cropX = 0; cropY = 0;
    applyAvatar("diamond");
    if (profileStatus) { profileStatus.textContent = "Uploaded picture removed. Diamond avatar selected."; profileStatus.className = "success"; }
});

profileChoiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
        uploadedPicture = "";
        rawPicture = "";
        pendingGifFile = null;

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
    const file = profileUploadInput.files?.[0]; if (!file) return;
    const gif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
    if (!file.type.startsWith("image/")) { if (profileStatus) { profileStatus.textContent = "Choose an image file."; profileStatus.className = "error"; } profileUploadInput.value = ""; return; }
    if (gif && !silverGifEntitled) { if (profileStatus) { profileStatus.textContent = "GIF profile pictures require the Silver GIF Pack. Purchase it, then refresh."; profileStatus.className = "error"; } profileUploadInput.value = ""; return; }
    if (gif && file.size > 400*1024) { if (profileStatus) { profileStatus.textContent = "GIFs must be 400 KB or smaller. This keeps profile uploads within the free Firestore document size limit."; profileStatus.className = "error"; } profileUploadInput.value = ""; return; }
    if (!gif && file.size > 5*1024*1024) { if (profileStatus) { profileStatus.textContent = "Please choose an image smaller than 5 MB."; profileStatus.className = "error"; } profileUploadInput.value = ""; return; }
    if (gif) { pendingGifFile=file; rawPicture=""; uploadedPicture=""; if(profileCrop)profileCrop.hidden=true; if(profilePreviewImage){profilePreviewImage.src=URL.createObjectURL(file);profilePreviewImage.style.display="block";} if(profileStatus){profileStatus.textContent="Silver GIF selected (up to 400 KB). Save your profile to upload it.";profileStatus.className="success";} return; }
    pendingGifFile=null; const reader=new FileReader();
    reader.onload=()=>{rawPicture=String(reader.result||"");cropScale=1;cropX=0;cropY=0;if(profileCrop)profileCrop.hidden=false;if(cropZoom)cropZoom.value="100";if(cropImage){cropImage.src=rawPicture;cropImage.style.transformOrigin="center center";cropImage.style.transform="translate(0px, 0px) scale(1)";}if(profileStatus){profileStatus.textContent="Drag the image to position it. Adjust zoom, then save.";profileStatus.className="success";}};
    reader.onerror=()=>{if(profileStatus){profileStatus.textContent="The image could not be opened.";profileStatus.className="error";}};reader.readAsDataURL(file);
});

// ==================================================
// SAVE PROFILE
// ==================================================

profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) return;

    const nextName = (profileDisplayName?.value || "").trim().slice(0, 30);
    const nextBadges = (profileBadgesInput?.value || "")
        .split(",")
        .map(value => value.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 4)
        .map(value => value.slice(0, 24));

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
        if (pendingGifFile) {
            if (!silverGifEntitled) throw new Error("Silver GIF Pack entitlement required.");
            uploadedPicture = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ""));
                reader.onerror = () => reject(new Error("The GIF could not be read."));
                reader.readAsDataURL(pendingGifFile);
            });
            if (!uploadedPicture.startsWith("data:image/gif;base64,")) {
                throw new Error("The selected file could not be saved as a GIF.");
            }
        } else if (rawPicture) {
            const croppedPicture = await renderCroppedPicture();

            if (!croppedPicture) {
                throw new Error("The selected picture could not be cropped.");
            }

            uploadedPicture = croppedPicture;
        }

        const maxPictureLength = pendingGifFile ? 600000 : 400000;
        if (uploadedPicture.length > maxPictureLength) {
            throw new Error(
                pendingGifFile
                    ? "This GIF is too large after encoding. Please choose a GIF smaller than 400 KB."
                    : "The cropped picture is too large. Please choose another image."
            );
        }

        await setDoc(
            doc(db, "users", currentUser.uid),
            {
                uid: currentUser.uid,
                displayName: nextName,
                avatar: currentAvatar,
                picture: uploadedPicture,
                badges: nextBadges,
                cosmetics: normalizeProfileCosmetics(selectedProfileCosmetics),
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

        currentProfileBadges = nextBadges;
        currentProfileCosmetics = normalizeProfileCosmetics(selectedProfileCosmetics);
        selectedProfileCosmetics = {
            ...currentProfileCosmetics,
            badges: [...currentProfileCosmetics.badges]
        };
        pendingGifFile = null; rawPicture = "";
        syncCreatedServerVoiceUser();
        void window.diamondVoiceControls?.refreshProfile?.();
        applyAvatar(currentAvatar);
        applyProfileCosmetics();

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
(function(){
let n=0,shade,spot,card;const tourKey=()=> "diamondLoungeTourSeen_v2_"+(currentUser?.uid||"");
const steps=[["#channelsSidebar .profile-card","Your profile & logout","Edit your profile here. The diamond avatar button is your logout button."],["#mainServerButton","VIP-LOUNGE","This is the default community server. Its text and voice channels are in the sidebar."],["#dmHomeButton","Direct Messages","Click this diamond to open your private messages and member directory."],["#supportBotOpen","Diamond Support","Open Diamond Support whenever you need help."]];
function cleanup(){shade?.remove();spot?.remove();card?.remove();shade=spot=card=null;window.removeEventListener("resize",pos);window.removeEventListener("scroll",pos,true);}
function pos(){if(!spot||!card)return;let t=document.querySelector(steps[n][0]);if(!t){card.style.visibility="hidden";return;}card.style.visibility="visible";let r=t.getBoundingClientRect();spot.style.left=Math.max(4,r.left-6)+"px";spot.style.top=Math.max(4,r.top-6)+"px";spot.style.width=r.width+12+"px";spot.style.height=r.height+12+"px";let w=Math.min(340,innerWidth-24),h=card.offsetHeight||160,l=Math.min(Math.max(12,r.left),innerWidth-w-12),y=r.bottom+14;if(y+h>innerHeight-12)y=Math.max(12,r.top-h-14);card.style.left=l+"px";card.style.top=y+"px";card.style.width=w+"px";}
function finish(){localStorage.setItem(tourKey(),"done");cleanup();}
function step(){let a=steps[n],t=document.querySelector(a[0]);if(!t){n++;if(n>=steps.length){finish();return;}step();return;}t.scrollIntoView({block:"nearest",behavior:"smooth"});card.innerHTML='<div class="dl-tour-eyebrow">DIAMOND LOUNGE TOUR · '+(n+1)+' / '+steps.length+'</div><h3>'+a[1]+'</h3><p>'+a[2]+'</p><div class="dl-tour-actions"><button class="dl-tour-skip">Skip tour</button><button class="dl-tour-next">'+(n===steps.length-1?'Finish':'Next')+'</button></div>';card.querySelector(".dl-tour-skip").onclick=finish;card.querySelector(".dl-tour-next").onclick=()=>{if(n===2&&!document.body.classList.contains("dm-mode"))document.getElementById("dmHomeButton")?.click();n++;if(n>=steps.length)finish();else step();};pos();}
function start(){cleanup();shade=document.createElement("div");shade.className="dl-tour-overlay";spot=document.createElement("div");spot.className="dl-tour-spotlight";card=document.createElement("section");card.className="dl-tour-popover";card.setAttribute("role","dialog");card.setAttribute("aria-modal","true");document.body.append(shade,spot,card);n=0;step();window.addEventListener("resize",pos);window.addEventListener("scroll",pos,true);}
function welcome(){if(!currentUser)return;const created=Date.parse(currentUser.metadata?.creationTime||"");if(!Number.isFinite(created)||Date.now()-created>24*60*60*1000||localStorage.getItem(tourKey()))return;let b=document.createElement("div");b.className="dl-tour-welcome-backdrop";b.innerHTML='<section class="dl-tour-welcome" role="dialog" aria-modal="true"><div class="dl-tour-eyebrow">WELCOME TO DIAMOND LOUNGE</div><h2>Want a quick tour?</h2><p>Learn what the diamonds and main controls do, or explore on your own.</p><div class="dl-tour-welcome-actions"><button class="dl-tour-skip">Explore on my own</button><button class="dl-tour-next">Take a tour</button></div></section>';document.body.append(b);b.querySelector(".dl-tour-skip").onclick=()=>{localStorage.setItem(tourKey(),"skipped");b.remove();};b.querySelector(".dl-tour-next").onclick=()=>{b.remove();start();};}
window.diamondLoungeStartTour=start;window.diamondLoungeResetTour=()=>localStorage.removeItem(tourKey());// Tour welcome is disabled temporarily while interaction-blocking bugs are repaired.
setTimeout(()=>document.querySelectorAll(".dl-tour-welcome-backdrop,.dl-tour-overlay,.dl-tour-spotlight,.dl-tour-popover").forEach(el=>el.remove()),1200);
})();

// Silver cosmetic details first; checkout is an explicit second step for members.
const PREMIUM_WORKER_URL = "https://diamond-lounge-premium.jeffreygustave1.workers.dev";

async function startSilverGifCheckout(button, note) {
    if (!auth.currentUser) {
        if (note) note.textContent = "Please sign in before purchasing premium cosmetics.";
        return;
    }
    if (isDiamondLoungeOwner()) {
        if (note) note.textContent = "The Silver GIF Pack is already included free with your Diamond Lounge owner account.";
        return;
    }
    if (PREMIUM_WORKER_URL.includes("YOUR-CLOUDFLARE-SUBDOMAIN")) {
        if (note) note.textContent = "Checkout is being prepared. The secure Worker must be deployed and its URL configured first.";
        return;
    }

    button.disabled = true;
    button.textContent = "Opening secure checkout…";
    try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch(PREMIUM_WORKER_URL + "/checkout/silver-gif-pack", {
            method: "POST",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json"
            }
        });
        const data = await response.json();
        if (!response.ok || !data.url) {
            throw new Error(data.error || "Checkout could not be started.");
        }
        window.location.assign(data.url);
    } catch (error) {
        if (note) note.textContent = error.message || "Unable to start checkout.";
        button.disabled = false;
        button.textContent = "Continue to checkout";
    }
}

document.querySelector('[data-cosmetic="silver-gif"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const note = document.getElementById("dlStorePaymentNote");
    const details = document.getElementById("dlSilverDetails");
    if (!details) {
        if (note) note.textContent = "Silver details are unavailable. Please refresh Diamond Lounge.";
        return;
    }

    if (!details.hidden) {
        details.hidden = true;
        button.textContent = isDiamondLoungeOwner() ? "Included · Free" : "View Silver";
        return;
    }

    const owner = isDiamondLoungeOwner();
    details.hidden = false;

    if (owner) {
        details.innerHTML = `
            <div class="dl-silver-details-heading">
                <span class="dl-store-lock">✦ DIAMOND LOUNGE OWNER BENEFIT</span>
                <strong>Silver GIF Pack — Included free</strong>
                <p>Your owner account has free access. No purchase or checkout is required.</p>
            </div>
            <div class="dl-silver-details-copy">
                <strong>Use your free profile GIF</strong>
                <ol>
                    <li>Choose <b>Choose a GIF</b> below.</li>
                    <li>Select a GIF image up to 400 KB.</li>
                    <li>Save your profile to upload and apply it.</li>
                </ol>
                <p><b>Current availability:</b> animated profile GIF upload is implemented. Animated server-icon uploads are not connected yet.</p>
            </div>
            <button type="button" class="dl-silver-action" id="dlSilverChooseGif">Choose a GIF</button>
        `;
        details.querySelector("#dlSilverChooseGif")?.addEventListener("click", () => {
            document.getElementById("profileUploadInput")?.click();
        });
        button.textContent = "Hide details";
        if (note) note.textContent = "Owner access confirmed for this account. The Silver GIF Pack is free.";
    } else {
        details.innerHTML = `
            <div class="dl-silver-details-heading">
                <span class="dl-store-lock">✦ SILVER EXCLUSIVE</span>
                <strong>Animated Profile GIF</strong>
                <p>The Silver pack unlocks the animated profile-picture upload after a verified purchase.</p>
            </div>
            <div class="dl-silver-details-copy">
                <strong>How it works</strong>
                <ol>
                    <li>Continue to secure checkout.</li>
                    <li>Complete the purchase.</li>
                    <li>Return to Diamond Lounge and refresh your profile editor.</li>
                    <li>Choose a GIF image up to 400 KB and save your profile.</li>
                </ol>
                <p><b>Current availability:</b> profile GIF uploads are implemented. Animated server-icon uploads are not connected yet.</p>
            </div>
            <button type="button" class="dl-silver-action" id="dlSilverCheckout">Continue to checkout</button>
        `;
        details.querySelector("#dlSilverCheckout")?.addEventListener("click", (checkoutEvent) => {
            startSilverGifCheckout(checkoutEvent.currentTarget, note);
        });
        button.textContent = "Hide details";
        if (note) note.textContent = "Review the Silver GIF details before choosing whether to purchase.";
    }
});


/* Native context-menu suppression and channel/category menu fallback */
document.addEventListener("contextmenu", function(event) {
  const serverIcon = event.target.closest(".server-icon.created-server");
  const channelRow = event.target.closest(".created-server-channel-item");
  const category = event.target.closest(".created-server-category-heading");
  if (!serverIcon && !channelRow && !category) return;
  event.preventDefault();
  if (serverIcon) return; // its own menu handler handles the menu
  closeServerContextMenu();
  const menu = document.createElement("div");
  menu.className = "dl-context-menu";
  menu.setAttribute("role","menu");
  const add = (label,fn,danger=false) => {
    const b=document.createElement("button"); b.type="button";
    b.className="dl-context-item"+(danger?" danger":""); b.textContent=label;
    b.onclick=()=>{menu.remove();fn();}; menu.appendChild(b);
  };
  if(channelRow){
    const id=channelRow.dataset.channelId, type=channelRow.dataset.channelType;
    const name=channelRow.querySelector(".created-server-channel-name")?.textContent||"Channel";
    add("Copy Channel ID",()=>void navigator.clipboard?.writeText(String(id||"")));
    if(type==="voice") add("Open Voice Channel",()=>channelRow.querySelector(".created-server-channel-button")?.click());
    else add("Open Channel",()=>channelRow.querySelector(".created-server-channel-button")?.click());
    const channel=(createdServerChannels||[]).find(x=>String(x.id)===String(id));
    if(channel && (currentServerHasPermission("manageChannels")||activeCreatedServerOwnerUid===currentUser?.uid))
      add("Delete Channel",()=>void deleteCreatedServerChannel(channel),true);
  } else if(category){
    add("Create Channel",()=>category.querySelector(".created-server-category-add")?.click());
    add("Delete Category",()=>category.querySelector(".created-server-channel-delete")?.click(),true);
  }
  menu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-220))+"px";
  menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-180))+"px";
  document.body.appendChild(menu);
  serverContextMenu=menu;
  setTimeout(()=>document.addEventListener("click",()=>menu.remove(),{once:true}),0);
},true);

// Dismiss voice/activity popups when tapping outside their dialog surface.
document.addEventListener("pointerdown", (event) => {
    const backdrop = document.getElementById("serverFeatureDialog");
    if (backdrop && !backdrop.querySelector(".created-server-feature-modal")?.contains(event.target)) backdrop.remove();
}, true);

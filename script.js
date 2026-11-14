document.addEventListener("DOMContentLoaded", function () {

    const channels =
        document.querySelectorAll(".voice-channel");

    channels.forEach(function (channel) {

        channel.addEventListener("click", function () {

            channels.forEach(function (item) {
                item.classList.remove("active");
            });

            channel.classList.add("active");

            const voiceMessage =
                document.createElement("div");

            voiceMessage.className = "message";

            voiceMessage.innerHTML =
                "<strong>System:</strong> You joined " +
                channel.textContent.trim();

            const messages =
                document.getElementById("messages");

            if (messages) {
                messages.appendChild(voiceMessage);
                messages.scrollTop =
                    messages.scrollHeight;
            }

        });

    });

});

const currentUser = localStorage.getItem("diamondUsername") || "Member";

window.onload = function () {
    const profileName = document.getElementById("profileName");

    if (profileName) {
        profileName.textContent = "💎 " + currentUser;
    }

    const currentUserElement = document.getElementById("currentUser");

    if (currentUserElement) {
        currentUserElement.textContent = "🟢 " + currentUser;
    }

    const messages = document.getElementById("messages");

    if (!messages) return;

    const savedMessages =
        JSON.parse(localStorage.getItem("chatMessages")) || [];

    savedMessages.forEach(function (message) {
        const newMessage = document.createElement("div");

        newMessage.className = "message";

        newMessage.innerHTML =
            "<strong>" + currentUser + ":</strong> " + message;

        messages.appendChild(newMessage);
    });
};

function sendMessage() {
    const input = document.getElementById("messageInput");

    if (!input) return;

    const message = input.value.trim();

    if (message === "") return;

    const messages = document.getElementById("messages");

    const newMessage = document.createElement("div");

    newMessage.className = "message";

    newMessage.innerHTML =
        "<strong>" + currentUser + ":</strong> " + message;

    messages.appendChild(newMessage);

    const savedMessages =
        JSON.parse(localStorage.getItem("chatMessages")) || [];

    savedMessages.push(message);

    localStorage.setItem(
        "chatMessages",
        JSON.stringify(savedMessages)
    );

    input.value = "";

    messages.scrollTop = messages.scrollHeight;
}

function clearChat() {
    localStorage.removeItem("chatMessages");
    location.reload();
}

document.addEventListener("DOMContentLoaded", function () {
    const input = document.getElementById("messageInput");

    if (!input) return;

    input.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });
});
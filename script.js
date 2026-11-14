window.sendMessage = function() {

    const input =
        document.getElementById("messageInput");

    if (!input) return;

    const text =
        input.value.trim();

    if (text === "") return;

    const messages =
        document.getElementById("messages");

    const message =
        document.createElement("div");

    message.className =
        "message";

    message.innerHTML =
        "<strong>Test User:</strong> " + text;

    messages.appendChild(message);

    input.value = "";
};

window.clearChat = function() {

    const messages =
        document.getElementById("messages");

    if (messages) {
        messages.innerHTML = "";
    }
};

console.log("Diamond Lounge Ready");
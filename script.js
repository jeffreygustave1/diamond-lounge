// Load saved messages when page opens

window.onload = function () {

    const savedMessages =
        JSON.parse(localStorage.getItem("chatMessages")) || [];

    const messages =
        document.getElementById("messages");

    savedMessages.forEach(function (message) {

        const newMessage =
            document.createElement("div");

        newMessage.className = "message";

        newMessage.innerHTML =
            "<strong>Jeffrey:</strong> " + message;

        messages.appendChild(newMessage);

    });

};

// Send Message

function sendMessage() {

    const input =
        document.getElementById("messageInput");

    const message =
        input.value.trim();

    if (message === "") {
        return;
    }

    const messages =
        document.getElementById("messages");

    const newMessage =
        document.createElement("div");

    newMessage.className = "message";

    newMessage.innerHTML =
        "<strong>Jeffrey:</strong> " + message;

    messages.appendChild(newMessage);

    let savedMessages =
        JSON.parse(localStorage.getItem("chatMessages")) || [];

    savedMessages.push(message);

    localStorage.setItem(
        "chatMessages",
        JSON.stringify(savedMessages)
    );

    input.value = "";

    messages.scrollTop =
        messages.scrollHeight;
}

// Enter Key

document.addEventListener("DOMContentLoaded", () => {

    const input =
        document.getElementById("messageInput");

    if (input) {

        input.addEventListener("keypress", function (event) {

            if (event.key === "Enter") {

                sendMessage();

            }

        });

    }

});

// Clear Chat

function clearChat() {

    localStorage.removeItem("chatMessages");

    location.reload();

}

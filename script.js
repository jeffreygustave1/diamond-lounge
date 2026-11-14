function sendMessage() {

    const input = document.getElementById("messageInput");

    const message = input.value.trim();

    if (message === "") {
        return;
    }

    const messages = document.getElementById("messages");

    const newMessage = document.createElement("div");

    newMessage.className = "message";

    newMessage.innerHTML =
        "<strong>Jeffrey:</strong> " + message;

    messages.appendChild(newMessage);

    input.value = "";

    messages.scrollTop = messages.scrollHeight;

}

document.addEventListener("DOMContentLoaded", () => {

    const input = document.getElementById("messageInput");

    if (input) {

        input.addEventListener("keypress", function (event) {

            if (event.key === "Enter") {

                sendMessage();

            }

        });

    }

});

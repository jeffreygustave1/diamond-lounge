const currentUser =
    localStorage.getItem("diamondUsername") ||
    "Member";

window.onload = function () {

    const profileName =
        document.getElementById("profileName");

    if (profileName) {
        profileName.innerHTML =
            "💎 " + currentUser;
    }

    const currentUserElement =
        document.getElementById("currentUser");

    if (currentUserElement) {
        currentUserElement.innerHTML =
            "🟢 " + currentUser;
    }

    const messages =
        document.getElementById("messages");

    const savedMessages =
        JSON.parse(
            localStorage.getItem("chatMessages")
        ) || [];

    savedMessages.forEach(function (message) {

        const newMessage =
            document.createElement("div");

        newMessage.className =
            "message";

        newMessage.innerHTML =
            "<strong>" +
            currentUser +
            ":</strong> " +
            message;

        messages.appendChild(
            newMessage
        );

    });

};

function sendMessage() {

    const input =
        document.getElementById(
            "messageInput"
        );

    const message =
        input.value.trim();

    if (message === "") {
        return;
    }

    const messages =
        document.getElementById(
            "messages"
        );

    const newMessage =
        document.createElement(
            "div"
        );

    newMessage.className =
        "message";

    newMessage.innerHTML =
        "<strong>" +
        currentUser +
        ":</strong> " +
        message;

    messages.appendChild(
        newMessage
    );

    const savedMessages =
        JSON.parse(
            localStorage.getItem(
                "chatMessages"
            )
        ) || [];

    savedMessages.push(
        message
    );

    localStorage.setItem(
        "chatMessages",
        JSON.stringify(
            savedMessages
        )
    );

    input.value = "";

    messages.scrollTop =
        messages.scrollHeight;

}

function clearChat() {

    localStorage.removeItem(
        "chatMessages"
    );

    location.reload();

}

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const input =
            document.getElementById(
                "messageInput"
            );

        if (input) {

            input.addEventListener(
                "keypress",
                function (event) {

                    if (
                        event.key === "Enter"
                    ) {

                        sendMessage();

                    }

                }
            );

        }

    }
);
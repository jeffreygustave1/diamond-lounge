// Keep voice controls and the participant list attached to the channel they belong to.
const panel = document.getElementById("voicePanel");
const channels = [...document.querySelectorAll(".voice-channel")];

channels.forEach((channel) => {
    channel.addEventListener("click", () => {
        // script.js also handles this click and marks the selected channel active.
        queueMicrotask(() => {
            const selectedChannel = document.querySelector(".voice-channel.active");
            if (!selectedChannel || !panel) return;

            selectedChannel.appendChild(panel);
            panel.hidden = false;
        });
    });
});

chrome.storage.local.get("isListening", (result) => {
    const isListening = result.isListening || false;
    updateButtonStates(isListening);
});

document.getElementById("startButton").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "start" });
    updateButtonStates(true);
});

document.getElementById("stopButton").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stop" });
    updateButtonStates(false);
});

document.getElementById("exportButton").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "export" });
});

document.getElementById('closeButton').addEventListener('click', function () {
    window.close(); // 关闭popup.html
});

function updateButtonStates(isListening) {
    document.getElementById("startButton").disabled = isListening;
    document.getElementById("stopButton").disabled = !isListening;
    chrome.storage.local.set({ "isListening": isListening });
}
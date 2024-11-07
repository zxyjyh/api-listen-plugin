chrome.storage.local.get("isListening", (result) => {
    const isListening = result && result.isListening || false;
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
    window.close();
});

document.getElementById('clearButton').addEventListener('click', function () {
    chrome.runtime.sendMessage({ action: "clearData" });
});

function updateButtonStates(isListening) {
    document.getElementById("startButton").disabled = isListening;
    document.getElementById("stopButton").disabled = !isListening;
    document.getElementById("exportButton").disabled = isListening;
    chrome.storage.local.set({ "isListening": isListening });
}
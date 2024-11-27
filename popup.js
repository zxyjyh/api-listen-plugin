chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
        const currentTab = tabs[0];
        const tabId = currentTab.id;
        const url = currentTab.url;

        console.log(tabId, url)

        chrome.storage.local.get("listeningTabs", (result) => {
            const listeningTabs = result.listeningTabs || {};
            const isListening = listeningTabs[tabId]?.isListening || false;
            updateButtonStates(isListening);
        });
    }
});

document.getElementById("startButton").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const currentTab = tabs[0];
            const tabId = currentTab.id;
            const url = currentTab.url;
            console.log(tabId, url)

            chrome.runtime.sendMessage({ action: "start", tabId, url });
            updateListeningState(tabId, url, true);
            updateButtonStates(true);
        }
    });
});

document.getElementById("stopButton").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const currentTab = tabs[0];
            const tabId = currentTab.id;
            const url = currentTab.url;

            chrome.runtime.sendMessage({ action: "stop", tabId, url });
            updateListeningState(tabId, url, false);
            updateButtonStates(false);
        }
    });
});

document.getElementById("exportButton").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "export" });
});

document.getElementById("closeButton").addEventListener("click", function () {
    window.close();
});

document.getElementById("clearButton").addEventListener("click", function () {
    chrome.runtime.sendMessage({ action: "clearData" });
});

function updateButtonStates(isListening) {
    document.getElementById("startButton").disabled = isListening;
    document.getElementById("stopButton").disabled = !isListening;
    document.getElementById("exportButton").disabled = isListening;
}

function updateListeningState(tabId, url, isListening) {
    chrome.storage.local.get("listeningTabs", (result) => {
        const listeningTabs = result.listeningTabs || {};

        if (isListening) {
            listeningTabs[tabId] = { url, isListening };
        } else {
            delete listeningTabs[tabId];
        }

        chrome.storage.local.set({ listeningTabs });
    });
}


chrome.runtime.sendMessage({ action: "getDataCount" }, (response) => {
    console.log(response)
    if (response.success) {
        document.getElementById("dataCount").innerText = `当前的记录数: ${response.count}`;
    } else {
        console.error("获取数据失败");
    }
});
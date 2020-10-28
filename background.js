'use strict';

// TODO: edit steps waiting for each shortcut
// TODO: add options page (global options, shortcuts list, add global shortcuts, add shortcuts for scripts)
// TODO: check if its in input when keys pressed or not

let host = null;

// update host on tab change
chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, ({url}) => {
        if (url) {
            const uO = new URL(url)
            host = uO.origin;
        }
    })
});

chrome.runtime.onInstalled.addListener(function () {

    chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [new chrome.declarativeContent.PageStateMatcher({})],
            actions: [new chrome.declarativeContent.ShowPageAction()]
        }]);
    });
});

chrome.commands.onCommand.addListener(function (command) {
    console.log('Command:', command);
});

chrome.runtime.onMessage.addListener(function (data, details, sendResponse) {

    switch (data.action) {
        case globalActions.INIT:
            host = data.host;
            loadGlobalOptions((globalOptions) => {
                loadHostData((siteData = {}) => {
                    sendResponse({siteData, globalOptions});
                })
            })
            return true;
        case globalActions.POPUP_INIT:
            // get site data and global options
            loadGlobalOptions((globalOptions) => {
                loadHostData((siteData = {}) => {
                    sendResponse({siteData, globalOptions});
                })
            })
            return true;
        case globalActions.NEW_SHORTCUT:
            host = data.host;
            if (!Array.isArray(data.shortcuts)) return;

            // the last item is the new shortcut
            const shortcut = data.shortcuts[data.shortcuts.length - 1]
            storeNewShortcut(shortcut)
            break;
        case globalActions.HOST_OPTION_UPDATE:
            storeHostOption(data.options, siteData => {
                sendMessageToCurrentTab({
                    action: contentActions.OPTION_UPDATE,
                    options: siteData.options,
                    shortcuts: siteData.shortcuts,
                });
            })
            break;
        case globalActions.GLOBAL_OPTIONS_UPDATE:
            storeGlobalOptions(data.options, (globalOptions) => {
                sendMessageToAllTabs({action: contentActions.OPTION_UPDATE, globalOptions});
                sendResponse(globalOptions)
            })
            return true;
        case globalActions.OPTIONS_INIT:
            getAllData((data) => {
                sendResponse(data)
            })
            return true
    }
    // sendGlobalMessage({"action": "INIT"});
})

// clearAllData()

function getHostShortcuts(cb) {
    loadHostData((siteData = {}) => {
        const shortcuts = siteData.shortcuts || [];
        // do nothing if shortcuts is not an array
        if (!Array.isArray(shortcuts)) return;

        if (cb && typeof cb === "function") cb(shortcuts)
    });
}

function loadHostData(cb) {
    if (!host) return;

    const key = getHostKey();

    chrome.storage.sync.get([key], function (data) {
        if (cb && typeof cb === "function")
            cb(data[key])
    });
}

function storeGlobalOptions(options = {}, cb) {
    loadGlobalOptions((data) => {
        const key = getGlobalOptionsKey();
        const updatedData = {...data, ...options}
        storeData(key, updatedData, function () {
            if (cb && typeof cb === "function") cb(updatedData)
        });
    });
}

function loadGlobalOptions(cb) {
    const key = getGlobalOptionsKey();
    loadData(key, (data) => {
        if (cb && typeof cb === "function") cb(data)
    });
}

function storeHostOption(options = {}, cb) {
    loadHostData((siteData = {}) => {

        const updatedData = {...siteData, options}
        const key = getHostKey();
        storeData(key, updatedData, function () {
            if (cb && typeof cb === "function") cb(updatedData)
        });
    });
}

function storeNewShortcut(shortcut) {
    loadHostData((siteData = {}) => {

        const updatedData = {...siteData, shortcuts: [...(siteData.shortcuts || []), shortcut]}
        const key = getHostKey();
        storeData(key, updatedData, function () {
            sendMessageToCurrentTab({action: contentActions.SHORTCUT_ADDED, keys: shortcut.keysUID})
        });
    });
}

function storeData(key, data, cb) {
    chrome.storage.sync.set({[key]: data}, function () {
        if (cb && typeof cb === "function") cb(data)
    });
}

function loadData(key, cb) {
    chrome.storage.sync.get([key], function (data) {
        if (cb && typeof cb === "function")
            cb(data[key])
    });
}

function getAllData(cb) {
    chrome.storage.sync.get(null, function (data) {
        if (cb && typeof cb === "function" && data) {
            const globalOptions = data.globalOptions;

            const shortcuts = data;
            delete shortcuts[getGlobalOptionsKey()]

            cb({globalOptions, shortcuts})
        }
    });
}

function clearAllData() {
    chrome.storage.sync.clear(function () {
        console.log("store cleared");
    });
}

function sendMessageToCurrentTab(body) {
    chrome.tabs.query({currentWindow: true, active: true}, (tabs) => {
        if (tabs && tabs[0])
            chrome.tabs.sendMessage(tabs[0].id, body);
    });
}

function sendMessageToAllTabs(body) {
    chrome.tabs.query({}, function (tabs) {
        for (let i = 0; i < tabs.length; ++i) {
            chrome.tabs.sendMessage(tabs[i].id, body);
        }
    });
}

function getHostKey() {
    return 'shortcuts-' + host;
}

function getGlobalOptionsKey() {
    return "globalOptions";
}

function sendGlobalMessage(body) {
    chrome.runtime.sendMessage(body);
}

// chrome.runtime.sendMessage({greeting: "optionsPageURL"}, function (response) {
//     console.log(response);
// });

// // A function to use as callback
// function doStuffWithDom(domContent) {
//     console.log('I received the following DOM content:\n' + domContent);
// }
//
// // When the browser-action button is clicked...
// chrome.browserAction.onClicked.addListener(function (tab) {
//     // ...check the URL of the active tab against our pattern and...
//     // ...if it matches, send a message specifying a callback too
//     chrome.tabs.sendMessage(tab.id, {text: 'report_back'}, doStuffWithDom);
// });


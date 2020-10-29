'use strict';

let allData = null;
let optionsForm = document.getElementById('options-form');
let toastElm = document.getElementById('issk-toast');
let shortkeysCountElm = document.getElementById('shortkeys-count');
let exportBtn = document.getElementById('export-btn');
let importBtn = document.getElementById('import-btn');
let importFileInput = document.getElementById('import-file-input');
let clearDataConfirm = document.getElementById('clear-data-confirm');
let clearDataBtn = document.getElementById('clear-data-btn');

initSettingsData();

document.addEventListener("click", (e) => {
    if (e.target.classList.contains('section-title')) {
        e.target.closest(".section").classList.toggle("open")
    }
}, true)

exportBtn.onclick = function (e) {
    sendGlobalMessage({action: globalActions.GET_ALL_DATA}, (response) => {
        createDownloadLink(JSON.stringify(response));
        showToast("Shortkeys exported.")
    });
}

importBtn.onclick = () => importFileInput.click();

importFileInput.onchange = function (e) {
    let reader = new FileReader();
    reader.onload = function () {
        console.log(reader.result);
    }

    reader.readAsText(this.files[0]);
}

optionsForm.onsubmit = function (e) {
    e.preventDefault();

    const formData = new FormData(e.target);

    let options = {
        off: false,
        preventInInputs: false,
        waitBetweenSteps: ".5",
    };

    for (let [key, value] of formData.entries()) {
        options[key] = value;
        if (value === "on")
            options[key] = true;

        if (key === "waitBetweenSteps") {
            options[key] = +value * 1000;
        }
    }

    sendGlobalMessage({action: globalActions.GLOBAL_OPTIONS_UPDATE, options}, (response) => {
        if (response) {
            showToast("Options updated.");
        }
    })
}

clearDataConfirm.onchange = e => {
    if (e.target.checked) {
        clearDataBtn.removeAttribute("disabled")
    } else {
        clearDataBtn.setAttribute("disabled", "true")
    }
}

clearDataBtn.onclick = () => {
    sendGlobalMessage({action: globalActions.CLEAT_DATA}, () => {
        initSettingsData();
        showToast("Shortkeys cleared.");

        clearDataBtn.setAttribute("disabled", "true")
        clearDataConfirm.checked = false;
    });
}

function initSettingsData() {
    clearDataConfirm.removeAttribute("checked");

    sendGlobalMessage({action: globalActions.GET_ALL_DATA}, (response) => {
        const {globalOptions = {}, shortcuts = {}} = allData = response || {};
        optionsForm.elements["waitBetweenSteps"].value = (globalOptions.waitBetweenSteps / 1000) || 0.5;

        if (globalOptions.off) {
            optionsForm.elements["off"].setAttribute("checked", "true");
        } else {
            optionsForm.elements["off"].removeAttribute("checked");
        }

        if (globalOptions.preventInInputs) {
            optionsForm.elements["preventInInputs"].setAttribute("checked", "true");
        } else {
            optionsForm.elements["preventInInputs"].removeAttribute("checked");
        }

        shortkeysCountElm.innerText = (Object.keys(shortcuts).length) + "";
    });
}

function showToast(msg, status = '') {
    toastElm.querySelector("p").innerText = msg;
    toastElm.classList.add("visible")
    if (status) toastElm.classList.add(status)

    setTimeout(() => {
        toastElm.classList.remove("visible")
        if (status) toastElm.classList.remove(status)
    }, 3000)
}

function createDownloadLink(text) {
    let link = document.createElement('a');
    link.target = "_blank"
    link.download = `in-site-shortkeys.json`
    let blob = new Blob([text], {type: 'application/json'});
    link.href = window.URL.createObjectURL(blob);
    link.click()
    link.remove()
}

function sendGlobalMessage(body, cb) {
    chrome.runtime.sendMessage(body, cb);
}

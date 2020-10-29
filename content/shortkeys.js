// https://github.com/webextension-toolbox/webextension-toolbox

const utils = (function () {

    function generateKeysUID(keys) {
        if (!keys) return "";

        return Object.entries(keys).reduce((res, b) => {
            if (!!b[1]) {
                // remove Key from end of keys like ctrlKey, altKey, shiftKey, etc
                let key = b[0].replace("Key", "");

                res.push(key === "key" ? keys[b[0]] : key)
            }

            return res
        }, []).join(" + ")
    }

    function generateStepElmQuery(step) {
        const tag = step.tg || '';
        const attributes = step.a || '';
        const parent = step.pr;

        let parentQ = '';
        if (parent) {
            // always use simple query as parents
            const [_pId, _pSimple] = generateStepElmQuery(parent);
            parentQ = _pId || _pSimple;
        }

        let id = null;
        let simpleQuery = `${parentQ} ${tag}`;
        let complexQuery = `${parentQ} ${tag}`;

        const allowedIdChars = /^[a-zA-z0-9-_\:\.]*$/;
        const allowedIdSelectorChars = /^[a-zA-z0-9-_]*$/;

        if (attributes.id) {
            if (allowedIdChars.test(attributes.id))
                id = attributes.id;

            if (allowedIdSelectorChars.test(attributes.id)) {
                simpleQuery += `#${attributes.id}`;
                complexQuery += `#${attributes.id}`;
            }

        } else {
            // add nth-child if index is bigger than 0
            if (tag && !!step.i) {
                simpleQuery += `:nth-child(${step.i})`
                complexQuery += `:nth-child(${step.i})`
            }

            for (let [attr, value] of Object.entries(attributes)) {
                switch (attr) {
                    case "class":
                        const classes = value.split(" ").map(c => "." + c).join("").trim();
                        complexQuery += `${classes}`;
                        break;
                    default:
                        complexQuery += `[${attr}="${value}"]`;
                        break;
                }
            }
        }

        simpleQuery = simpleQuery.replace(/\.\./, ".").trim();
        complexQuery = complexQuery.replace(/\.\./, ".").trim();

        return [id, simpleQuery, complexQuery]
    }

    function findIndexAsChild(child) {
        if (!child || !child.parentNode) return null;

        const parent = child.parentNode;
        return Array.prototype.indexOf.call(parent.children, child) + 1;
    }

    function findTargetElm(step) {

        if (!step) return null;

        let elm;

        const [id, simpleQuery, complexQuery] = generateStepElmQuery(step);

        if (id) elm = document.getElementById(id)

        if (!elm) elm = document.querySelector(simpleQuery)

        if (!elm) elm = document.querySelector(complexQuery)

        if (!elm) console.log({id, simpleQuery, complexQuery})
        return elm
    }

    /**
     * create new step object
     * @param targetElm
     * @returns {object}
     */
    function createStep(targetElm) {
        const step = {}

        if (!targetElm || targetElm.nodeName === "#document") return step;

        const validAttrs = ["id", "role", "tabIndex", "type"]

        const rawAttrs = targetElm.attributes || [];
        const rawAttrsLen = rawAttrs.length;

        // set attribute (a) property
        if (!!rawAttrsLen) step.a = {};

        for (let i = 0; i < rawAttrsLen; i++) {
            const attrName = rawAttrs[i].nodeName;
            if (!validAttrs.includes(attrName)) continue;

            step.a[attrName] = (targetElm.getAttribute(attrName) || '').trim()
        }

        step.tg = targetElm.tagName.toLowerCase();
        step.tx = (targetElm.textContent || 'Unknown')
            .replace(/(\r\n|\n|\r)/gm, "")
            .trim()
            .substr(0, 20);

        step.i = findIndexAsChild(targetElm)

        const [id, simpleQuery, complexQuery] = generateStepElmQuery(step)
        // console.log({id, simpleQuery, complexQuery});
        if (!id) {
            try {
                // if (document.querySelectorAll(simpleQuery).length > 1) {
                //     if (document.querySelectorAll(complexQuery).length > 1)
                //         step.pr = createStep(targetElm.parentNode)
                // }
            } catch (e) {
                console.log("invalid query selector", {id, simpleQuery, complexQuery});
            }

        } else if (!targetElm.isEqualNode(findTargetElm(step))) {
            step.pr = createStep(targetElm.parentNode)
        }

        return step;
    }

    function createNewShortcut(target, keys, title) {
        return {
            i: `${new Date().getTime()}`,
            t: title,
            k: utils.generateKeysUID(keys),
            tr: target
        };
    }

    return {
        generateKeysUID,
        findTargetElm,
        createStep,
        createNewShortcut,
    }
})();

const shortkeys = (function () {

    let hostShortcuts = [];

    const onAddListeners = [];

    let currentLinkedTargets = null;
    let headStep = null;
    let momentStepsCount = 0;

    let listeningToStep = false;

    let options = {waitBetweenSteps: 100, off: false, allowInInputs: false};

    let ui = {
        stepsPopupElm: null,
        stepsPopupElmStepsWrapper: null,
        keysPopupElmKeysWrapper: null,
    }

    let lastKeyEvent = null;

    let currentKeys = null;
    let currentShortkeyTitle = '';

    let addedLinkSteps = [];

    function listen() {
        listeningToStep = true;
        currentLinkedTargets = null;
        headStep = null;
        addedLinkSteps = [];

        showStepsPopup();

        preventLinksClick();
        document.addEventListener("click", handleDocClick)
    }

    function abortAdding() {

        listeningToStep = false;
        currentLinkedTargets = null;
        headStep = null;
        addedLinkSteps = [];
        momentStepsCount = 0;

        releaseLinksClick();

        deactivateKeysDetectionMode(handleKeysDetection);

        if (ui.stepsPopupElm)
            ui.stepsPopupElm.remove();

        if (ui.keysPopupElm)
            ui.keysPopupElm.remove();

    }

    function upHostShortcuts(shortcuts, globalOptions) {
        // update shortcuts list
        if (Array.isArray(shortcuts) && shortcuts.length > 0) {
            hostShortcuts = shortcuts;
        }

        // update global options
        if (globalOptions) options = {...options, ...globalOptions};

        console.log("init listeners...");
        window.removeEventListener("keydown", handleKeydown)
        window.addEventListener("keydown", handleKeydown)

        if (options.off) downHostShortcuts();
    }

    function downHostShortcuts() {
        console.log("down listeners...");
        window.removeEventListener("keydown", handleKeydown)
    }

    function addStep(targetElm) {

        const step = utils.createStep(targetElm)

        if (!headStep) {
            currentLinkedTargets = headStep = step;
        } else {
            headStep = headStep.nx = step;
        }

        momentStepsCount++;

        addStepToPopup(step);
    }

    function addShortcut(keys) {
        if (!keys) return;

        if (currentLinkedTargets && listeningToStep) {

            if (isKeysUsedBefore(keys)) {
                throw new Error("Key used before")
            }

            const newShortcut = utils.createNewShortcut(currentLinkedTargets, keys, currentShortkeyTitle);

            // push to shortcuts
            hostShortcuts.push(newShortcut);

            console.log("New shortcut added in tab local :)");
        }

        triggerOnAddEvent();
        abortAdding();
    }

    function activateKeysDetectionMode(cb) {
        // add listeners
        window.addEventListener("keydown", handleDetectionKeydown);
        window.addEventListener("keyup", handleDetectionKeyup.bind(this, cb))
    }

    function deactivateKeysDetectionMode(cb) {
        // remove listener
        window.removeEventListener("keydown", handleDetectionKeydown)
        window.removeEventListener("keyup", handleDetectionKeyup.bind(this, cb))
    }

    function addStepToPopup(step) {
        if (!ui.stepsPopupElmStepsWrapper) return;

        const createStepElm = (id, title, sub) => {
            let temp = document.createElement("template");
            temp.innerHTML = `
                <div class="step">
                    <strong class="step-text" contenteditable="true" id="step-${id}">${title}</strong>
                    <span class="step-sub">${sub}</span>
                </div>`;

            return temp.content.firstElementChild;
        };

        const noStepElm = ui.stepsPopupElmStepsWrapper.querySelector(".no-step");
        if (noStepElm) noStepElm.remove();

        const stepElm = createStepElm(momentStepsCount, step.text, `step ${momentStepsCount}`);
        const stepTitleElm = stepElm.querySelector(`#step-${momentStepsCount}`);

        if (stepTitleElm) {
            stepTitleElm.addEventListener("input", e => {
                step.tx = e.target.textContent
                    .replace(/[^a-zA-Z -_.]/g, "")
                    .substr(0, 15)
            })
        }

        ui.stepsPopupElmStepsWrapper.appendChild(stepElm)
    }

    function fireElementEvents(element, options = {}) {
        if (!element) {
            console.log("Element not found!");
            return
        }

        const eventOptions = {bubbles: true, ...options};

        const validMouseEvents = ["click", "mousedown", "mouseup"];

        // dispatch above events
        validMouseEvents.forEach(event => {
            const ev = new MouseEvent(event, eventOptions)
            element.dispatchEvent(ev)
        })
    }

    function callNextStep(current) {
        if (!current) return;

        const elm = utils.findTargetElm(current);

        fireElementEvents(elm);

        setTimeout(() => {
            callNextStep(current.nx)
        }, options.waitBetweenSteps || 0)
    }

    // BUILD IN UTILS
    function isUniqueLinkInSteps(newLink) {
        let isUnique = true;
        const newURL = new URL(newLink);
        const newLinkPath = newURL.origin + newURL.pathname;

        for (let link of addedLinkSteps) {
            const url = new URL(link);
            const urlPath = url.origin + url.pathname;

            if (newLinkPath !== urlPath) {
                isUnique = false;
                break;
            }
        }

        addedLinkSteps.push(newLink)

        return isUnique;
    }

    function isKeysUsedBefore(keys) {
        if (!keys) return true;

        const keysUID = utils.generateKeysUID(keys)
        return hostShortcuts.some(item => item.keysUID === keysUID);
    }

    function preventLinksClick() {
        document.querySelectorAll("a")
            .forEach((aElm) => {
                aElm.addEventListener("click", handleLinkTagClick)
            })
    }

    function releaseLinksClick() {
        document.querySelectorAll("a")
            .forEach((aElm) => {
                aElm.removeEventListener("click", handleLinkTagClick)
            })
    }

    // EVENT HANDLERS
    function handleDocClick(e) {
        if (!e || !e.target || !listeningToStep) return;

        if (e.path && e.path.some(elm => elm === ui.stepsPopupElm)) return;

        // handle links click
        let linkTagIndex = (e.path || []).findIndex(elm => elm.tagName === "A");
        if (linkTagIndex > -1) {
            const target = e.path[linkTagIndex];
            if (!isUniqueLinkInSteps(target.href)) {
                ui.stepsPopupElmMsg.innerText = "Different link steps added, this may causes faulty action."
            }
        }

        shortkeys.addStep(e.target);
    }

    function handleLinkTagClick(e) {
        e.preventDefault();

        return false
    }

    function handleKeydown(e) {
        for (let {k, tr: target} of hostShortcuts) {
            let keys = k.split(" + ");

            if (
                e.ctrlKey === keys.includes("ctrl") &&
                e.shiftKey === keys.includes("shift") &&
                e.altKey === keys.includes("alt") &&
                keys.includes(e.key.toLowerCase())
            ) {
                e.preventDefault();

                // let curTarget = target;
                callNextStep(target)

                // break loop when reached the target short-key
                break;
            }
        }
    }

    function handleDetectionKeydown(e) {
        e.preventDefault();
        lastKeyEvent = e;
    }

    function handleDetectionKeyup(cb, e) {
        e.preventDefault();

        if (!lastKeyEvent) return;

        const {ctrlKey, shiftKey, altKey, key} = lastKeyEvent;

        let keys = {ctrlKey, shiftKey, altKey, key: key.toLowerCase()}
        lastKeyEvent = null;

        if (cb && typeof cb === "function") {
            cb(keys)
        }
    }

    function handleKeysDetection(keys) {
        currentKeys = keys;

        ui.keysPopupElmKeysWrapper.innerHTML = utils.generateKeysUID(keys);
    }

    function onAdd(fn) {
        if (fn && typeof fn === "function")
            onAddListeners.push(fn)
    }

    function triggerOnAddEvent() {
        for (let fn of onAddListeners) {
            fn(hostShortcuts);
        }
    }

    // UI METHODS
    function showStepsPopup() {

        const createPopupElm = (shortkeyDefaultTitle = '') => {
            let temp = document.createElement("template");
            temp.innerHTML = `
                <div class="issk issk-popup">
                    <div class="issk-container">
                        <strong class="label">Action Steps:</strong>
                        <div class="steps" id="shortcut-steps"><span class="no-step">Click on action to add step</span></div>
                    </div>
                    <div class="issk-container">
                        <strong class="label">Shortkey Title:</strong>
                        <input type="text" id="shortkey-title-input"
                            value="${shortkeyDefaultTitle}" maxlength="20"
                            placeholder="Shortcut Name *">
                    </div>
                    <div id="steps-popup-msg" class="issk-popup-msg"></div>
                    <div class="actions">
                        <button id="shortcut-cancel-btn" class="cancel">Cancel</button>
                        <button id="open-keys-modal">Set Shortcut Keys</button>
                    </div>
                </div>`;

            return temp.content.firstElementChild;
        };

        if (ui.stepsPopupElm) {
            ui.stepsPopupElm.remove();
        }

        currentShortkeyTitle = `Shortcut ${hostShortcuts.length + 1}`;
        ui.stepsPopupElm = createPopupElm(currentShortkeyTitle);
        ui.stepsPopupElmStepsWrapper = ui.stepsPopupElm.querySelector("#shortcut-steps");
        ui.stepsPopupElmMsg = ui.stepsPopupElm.querySelector("#steps-popup-msg");

        const stepsPopupElmKeysOpenBtn = ui.stepsPopupElm.querySelector("#open-keys-modal");
        const stepsPopupElmCancelBtn = ui.stepsPopupElm.querySelector("#shortcut-cancel-btn");
        const stepsPopupElmTitleInput = ui.stepsPopupElm.querySelector("#shortkey-title-input");

        const handleNameInputChange = e => {
            currentShortkeyTitle = e.target.value.replace(/[^a-zA-Z -_.]/g, "")
        }

        const handleAddBtnClick = (e) => {
            ui.stepsPopupElmMsg.innerText = ""
            if (!headStep) {
                ui.stepsPopupElmMsg.innerText = "No steps added."
                return;
            }

            if (!currentShortkeyTitle) {
                ui.stepsPopupElmMsg.innerText = "Enter shortkey title."
                return;
            }

            document.removeEventListener("click", handleDocClick)
            showKeysInputPopup()

            // remove button listener
            stepsPopupElmKeysOpenBtn.removeEventListener("click", handleAddBtnClick)
        }

        stepsPopupElmKeysOpenBtn.addEventListener("click", handleAddBtnClick)
        stepsPopupElmCancelBtn.addEventListener("click", abortAdding)

        stepsPopupElmTitleInput.addEventListener("change", handleNameInputChange)

        document.body.appendChild(ui.stepsPopupElm)
    }

    function showKeysInputPopup() {
        const createKeysInputElm = () => {
            let temp = document.createElement("template");
            temp.innerHTML = `
                <div class="issk issk-fixed-modal" tabindex="1">
                    <div class="issk-popup">
                        <div class="keys-container">
                            <strong class="label">Shortcut for above steps:</strong>
                            <pre class="keys-input" id="keys-pre">Press keys that you want...</pre>
                        </div>
                        <ul class="issk-popup-msg info">
                            <li><code>ctrl + t</code> and <code>ctrl + w</code> are reserved by your browser.</li>
                        </ul>
                        <div id="keys-popup-msg" class="issk-popup-msg"></div>
                        <div class="actions">
                            <button id="shortcut-cancel-btn" class="cancel">Cancel</button>
                            <button id="shortcut-add-btn">Add</button>
                        </div>
                    </div>
                </div>`;

            return temp.content.firstElementChild;
        };

        // close steps popup
        if (ui.stepsPopupElm) {
            ui.stepsPopupElm.remove();
        }

        if (ui.keysPopupElm) {
            ui.keysPopupElm.remove();
        }

        ui.keysPopupElm = createKeysInputElm();
        ui.keysPopupElmKeysWrapper = ui.keysPopupElm.querySelector("#keys-pre");

        const keysPopupElmAddBtn = ui.keysPopupElm.querySelector("#shortcut-add-btn");
        const popupElmCancelBtn = ui.keysPopupElm.querySelector("#shortcut-cancel-btn");
        const keysPopupElmMsg = ui.keysPopupElm.querySelector("#keys-popup-msg");

        const handleAddBtnClick = () => {
            keysPopupElmMsg.innerHTML = "";
            if (!currentKeys) {
                keysPopupElmMsg.innerHTML = "Determine the shortcut first."
                return;
            }

            if (isKeysUsedBefore(currentKeys)) {
                keysPopupElmMsg.innerHTML = "This shortkey used before."
                return;
            }

            addShortcut(currentKeys)

            // remove button listener
            keysPopupElmAddBtn.removeEventListener("click", handleAddBtnClick)
        }

        keysPopupElmAddBtn.addEventListener("click", handleAddBtnClick)
        popupElmCancelBtn.addEventListener("click", abortAdding)

        document.body.appendChild(ui.keysPopupElm)
        ui.keysPopupElm.focus();

        // detect shortcuts and set it
        activateKeysDetectionMode(handleKeysDetection);

    }

    function showSuccessToast(keys) {

        const createToastElm = () => {
            let temp = document.createElement("template");
            temp.innerHTML = `
                <div class="issk-toast">
                    <div class="issk-container">
                        <p class="issk-p">New shortcut was added.</p>
                        <pre class="issk-pre">${keys || 'Unknown Keys'}</pre>
                    </div>
                </div>`;

            return temp.content.firstElementChild;
        };

        if (ui.successToastElm) {
            ui.successToastElm.remove();
        }

        ui.successToastElm = createToastElm();

        document.body.appendChild(ui.successToastElm);

        setTimeout(() => {
            if (ui.successToastElm)
                ui.successToastElm.remove();

        }, 3000)
    }


    return {
        listening: listeningToStep,
        shortcuts: hostShortcuts,
        listen,
        addStep,
        upHostShortcuts,
        downHostShortcuts,
        onAdd,
        showSuccessToast,
    }
})();
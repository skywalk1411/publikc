// ============================================================================
// Custom Skin Loader (CSL4)
// ============================================================================
// Replaces player skin textures with a custom skin URL or uploaded file
// ============================================================================
// Constants
// ============================================================================
var DEFAULT_SKIN_URL = "https://i.imgur.com/28oRhB7.png";
var muzzleImg = "https://kirka.io/assets/img/__shooting-fire__.effa20af.png";
var muzzleImg2 = "shooting-fire";
// ============================================================================
// Global State Management
// ============================================================================
// Cache localStorage values
var cachedCslEnabled;
var cachedCslUrl;
var cachedCslCustomEnabled;
var cachedCslCustomData;
// Track already-patched images to prevent repeated replacements
var patchedImages = new WeakSet();
// Initialize localStorage with default values
function initializeCslLocalStorage() {
    if (!localStorage.cslEnabled) {
        localStorage.cslEnabled = "off";
    }
    if (!localStorage.cslUrl) {
        localStorage.cslUrl = DEFAULT_SKIN_URL;
    }
    if (!localStorage.cslCustomEnabled) {
        localStorage.cslCustomEnabled = "off";
    }
    if (!localStorage.cslCustomData) {
        localStorage.cslCustomData = "";
    }
    syncCslCache();
}
// Sync cache with localStorage
function syncCslCache() {
    cachedCslEnabled = localStorage.cslEnabled;
    cachedCslUrl = localStorage.cslUrl;
    cachedCslCustomEnabled = localStorage.cslCustomEnabled;
    cachedCslCustomData = localStorage.cslCustomData;
}
// Get the active skin URL based on settings
function getActiveSkinUrl() {
    if (cachedCslEnabled !== "on") {
        return null;
    }
    if (cachedCslCustomEnabled === "on" && cachedCslCustomData) {
        return cachedCslCustomData;
    }
    return cachedCslUrl || null;
}
// ============================================================================
// Helper Functions
// ============================================================================
function createCslElementWithClass(tagName, className, textContent) {
    if (textContent === void 0) { textContent = ""; }
    var el = document.createElement(tagName);
    el.className = className;
    if (textContent) {
        el.textContent = textContent;
    }
    return el;
}
function createCslElementWithText(tagName, textContent) {
    var el = document.createElement(tagName);
    el.textContent = textContent;
    return el;
}
function createCslDropdown(id, options) {
    var sel = document.createElement("select");
    sel.id = id;
    for (var i = 0; i < options.length; i++) {
        var opt = document.createElement("option");
        opt.value = options[i].value;
        opt.textContent = options[i].text;
        sel.appendChild(opt);
    }
    return sel;
}
function createCslTextInput(id, placeholder) {
    if (placeholder === void 0) { placeholder = ""; }
    var input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.placeholder = placeholder;
    input.style.cssText = "width: 100%; padding: 5px; border: 1px solid #444; background: #222; color: #fff; border-radius: 4px; margin-top: 5px;";
    return input;
}
function createCslFileInput(id) {
    var input = document.createElement("input");
    input.type = "file";
    input.id = id;
    input.accept = "image/png";
    input.style.cssText = "display: none;";
    return input;
}
function createCslButton(id, text) {
    var btn = document.createElement("button");
    btn.id = id;
    btn.textContent = text;
    btn.style.cssText = "padding: 5px 10px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;";
    return btn;
}
// ============================================================================
// UI Setup
// ============================================================================
// Create option group for CSL settings
var cslOptionGroup = createCslElementWithClass("div", "option-group");
// Option 1: Enable Custom Skin
var optionDivCslEnable = createCslElementWithClass("div", "option");
var cslEnableLeftDiv = createCslElementWithClass("div", "left");
var cslEnableLabel = createCslElementWithText("span", "Custom Skin Loader");
var cslEnableDesc = createCslElementWithClass("span", "description", "Enable custom skin texture replacement");
var cslEnableSelect = createCslDropdown("csl_enable", [
    { value: "on", text: "On" },
    { value: "off", text: "Off" }
]);
cslEnableLeftDiv.appendChild(cslEnableLabel);
cslEnableLeftDiv.appendChild(cslEnableDesc);
optionDivCslEnable.appendChild(cslEnableLeftDiv);
optionDivCslEnable.appendChild(cslEnableSelect);
// Option 2: Skin URL
var optionDivCslUrl = createCslElementWithClass("div", "option");
var cslUrlLeftDiv = createCslElementWithClass("div", "left");
var cslUrlLabel = createCslElementWithText("span", "Skin URL");
var cslUrlDesc = createCslElementWithClass("span", "description", "URL to skin texture image (PNG)");
var cslUrlInput = createCslTextInput("csl_url", "https://example.com/skin.png");
cslUrlInput.style.cssText = "width: 200px; padding: 5px; border: 1px solid #444; background: #222; color: #fff; border-radius: 4px;";
cslUrlLeftDiv.appendChild(cslUrlLabel);
cslUrlLeftDiv.appendChild(cslUrlDesc);
optionDivCslUrl.appendChild(cslUrlLeftDiv);
optionDivCslUrl.appendChild(cslUrlInput);
// Option 3: Enable Custom File
var optionDivCslCustomEnable = createCslElementWithClass("div", "option");
var cslCustomEnableLeftDiv = createCslElementWithClass("div", "left");
var cslCustomEnableLabel = createCslElementWithText("span", "Use Custom File");
var cslCustomEnableDesc = createCslElementWithClass("span", "description", "Use uploaded file instead of URL");
var cslCustomEnableSelect = createCslDropdown("csl_custom_enable", [
    { value: "on", text: "On" },
    { value: "off", text: "Off" }
]);
cslCustomEnableLeftDiv.appendChild(cslCustomEnableLabel);
cslCustomEnableLeftDiv.appendChild(cslCustomEnableDesc);
optionDivCslCustomEnable.appendChild(cslCustomEnableLeftDiv);
optionDivCslCustomEnable.appendChild(cslCustomEnableSelect);
// Option 4: File Upload
var optionDivCslFile = createCslElementWithClass("div", "option");
var cslFileLeftDiv = createCslElementWithClass("div", "left");
var cslFileLabel = createCslElementWithText("span", "Upload Skin File");
var cslFileDesc = createCslElementWithClass("span", "description", "Upload a PNG skin texture file");
var cslFileInput = createCslFileInput("csl_file_input");
var cslFileButton = createCslButton("csl_file_button", "Browse...");
var cslFileStatus = createCslElementWithClass("span", "csl-file-status", "No file selected");
cslFileStatus.style.cssText = "margin-left: 10px; color: #888; font-size: 12px;";
var cslFileRightDiv = createCslElementWithClass("div", "right");
cslFileRightDiv.style.cssText = "display: flex; align-items: center;";
cslFileRightDiv.appendChild(cslFileInput);
cslFileRightDiv.appendChild(cslFileButton);
cslFileRightDiv.appendChild(cslFileStatus);
cslFileLeftDiv.appendChild(cslFileLabel);
cslFileLeftDiv.appendChild(cslFileDesc);
optionDivCslFile.appendChild(cslFileLeftDiv);
optionDivCslFile.appendChild(cslFileRightDiv);
// Tooltip for CSL
var cslTooltipContainer = createCslElementWithClass("div", "tooltip-container-GVL");
var cslTooltipIcon = createCslElementWithClass("span", "info-icon-GVL", "i");
var cslTooltipText = createCslElementWithClass("div", "tooltip-text-GVL", "Custom Skin Loader - Replace player skins with custom textures");
cslTooltipContainer.appendChild(cslTooltipIcon);
cslTooltipContainer.appendChild(cslTooltipText);
// Assemble option group
cslOptionGroup.appendChild(cslTooltipContainer);
cslOptionGroup.appendChild(optionDivCslEnable);
cslOptionGroup.appendChild(optionDivCslUrl);
cslOptionGroup.appendChild(optionDivCslCustomEnable);
cslOptionGroup.appendChild(optionDivCslFile);
// ============================================================================
// Initialization
// ============================================================================
document.addEventListener("DOMContentLoaded", function () {
    initializeCslLocalStorage();
    setTimeout(function () {
        var container = document.getElementById("scripts-options");
        if (container) {
            container.appendChild(cslOptionGroup);
            // Setup Enable toggle
            var enableSelector_1 = document.getElementById("csl_enable");
            if (enableSelector_1) {
                enableSelector_1.value = cachedCslEnabled;
                enableSelector_1.addEventListener("change", function () {
                    localStorage.cslEnabled = enableSelector_1.value;
                    syncCslCache();
                });
            }
            // Setup URL input
            var urlInput_1 = document.getElementById("csl_url");
            if (urlInput_1) {
                urlInput_1.value = cachedCslUrl;
                urlInput_1.addEventListener("change", function () {
                    localStorage.cslUrl = urlInput_1.value;
                    syncCslCache();
                });
                urlInput_1.addEventListener("blur", function () {
                    localStorage.cslUrl = urlInput_1.value;
                    syncCslCache();
                });
            }
            // Setup Custom Enable toggle
            var customEnableSelector_1 = document.getElementById("csl_custom_enable");
            if (customEnableSelector_1) {
                customEnableSelector_1.value = cachedCslCustomEnabled;
                customEnableSelector_1.addEventListener("change", function () {
                    localStorage.cslCustomEnabled = customEnableSelector_1.value;
                    syncCslCache();
                });
            }
            // Setup File input
            var fileInput_1 = document.getElementById("csl_file_input");
            var fileButton = document.getElementById("csl_file_button");
            var fileStatus_1 = document.querySelector(".csl-file-status");
            if (fileButton && fileInput_1) {
                fileButton.addEventListener("click", function () {
                    fileInput_1.click();
                });
                fileInput_1.addEventListener("change", function (e) {
                    var _a;
                    var target = e.target;
                    var file = (_a = target.files) === null || _a === void 0 ? void 0 : _a[0];
                    if (file) {
                        if (!file.type.includes("png")) {
                            if (fileStatus_1)
                                fileStatus_1.textContent = "Error: Only PNG files allowed";
                            return;
                        }
                        var reader = new FileReader();
                        reader.onload = function (event) {
                            var _a;
                            var dataUrl = (_a = event.target) === null || _a === void 0 ? void 0 : _a.result;
                            localStorage.cslCustomData = dataUrl;
                            syncCslCache();
                            if (fileStatus_1)
                                fileStatus_1.textContent = "Loaded: ".concat(file.name);
                        };
                        reader.onerror = function () {
                            if (fileStatus_1)
                                fileStatus_1.textContent = "Error reading file";
                        };
                        reader.readAsDataURL(file);
                    }
                });
                // Show status if custom data exists
                if (cachedCslCustomData && fileStatus_1) {
                    fileStatus_1.textContent = "Custom file loaded";
                }
            }
        }
    }, 1000);
});
// ============================================================================
// Array.isArray Patch for Texture Replacement
// ============================================================================
var oldIsArr = Array.isArray;
Array.isArray = function () {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    // Fast path: if first arg doesn't have map.image structure, skip immediately
    var arg = args[0];
    if (!arg || !arg.map || !arg.map.image) {
        return oldIsArr.apply(Array, args);
    }
    var customSkinLink = getActiveSkinUrl();
    // Skip if disabled or no URL configured
    if (!customSkinLink) {
        return oldIsArr.apply(Array, args);
    }
    var image = arg.map.image;
    var width = image.width, height = image.height, src = image.src;
    // Check if this is a player skin texture (64x64, 64x32, 42x42, 42x32)
    // and NOT a muzzle flash or already-patched texture
    if ((width === 64 || width === 42) &&
        (height === 64 || height === 42 || height === 32) &&
        src !== muzzleImg &&
        src !== customSkinLink &&
        !src.includes(muzzleImg2) &&
        !patchedImages.has(image)) {
        image.src = customSkinLink;
        patchedImages.add(image);
    }
    return oldIsArr.apply(Array, args);
};

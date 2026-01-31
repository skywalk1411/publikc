// ============================================================================
// Custom Skin Loader (CSL4)
// ============================================================================
// Replaces player skin textures with a custom skin URL or uploaded file

// ============================================================================
// Type Definitions
// ============================================================================

interface ImageMapArgs {
  map?: {
    image?: {
      width?: number;
      height?: number;
      src?: string;
    };
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SKIN_URL = "https://i.imgur.com/28oRhB7.png";
const muzzleImg = "https://kirka.io/assets/img/__shooting-fire__.effa20af.png";
const muzzleImg2 = "shooting-fire";

// ============================================================================
// Global State Management
// ============================================================================

// Cache localStorage values
let cachedCslEnabled: string;
let cachedCslUrl: string;
let cachedCslCustomEnabled: string;
let cachedCslCustomData: string;

// Track already-patched images to prevent repeated replacements
const patchedImages = new WeakSet<HTMLImageElement>();

// Initialize localStorage with default values
function initializeCslLocalStorage(): void {
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
function syncCslCache(): void {
  cachedCslEnabled = localStorage.cslEnabled;
  cachedCslUrl = localStorage.cslUrl;
  cachedCslCustomEnabled = localStorage.cslCustomEnabled;
  cachedCslCustomData = localStorage.cslCustomData;
}

// Get the active skin URL based on settings
function getActiveSkinUrl(): string | null {
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

function createCslElementWithClass(tagName: string, className: string, textContent: string = ""): HTMLElement {
  const el = document.createElement(tagName);
  el.className = className;
  if (textContent) {
    el.textContent = textContent;
  }
  return el;
}

function createCslElementWithText(tagName: string, textContent: string): HTMLElement {
  const el = document.createElement(tagName);
  el.textContent = textContent;
  return el;
}

function createCslDropdown(id: string, options: Array<{value: string, text: string}>): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.id = id;

  for (let i = 0; i < options.length; i++) {
    const opt = document.createElement("option");
    opt.value = options[i].value;
    opt.textContent = options[i].text;
    sel.appendChild(opt);
  }

  return sel;
}

function createCslTextInput(id: string, placeholder: string = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.placeholder = placeholder;
  input.style.cssText = "width: 100%; padding: 5px; border: 1px solid #444; background: #222; color: #fff; border-radius: 4px; margin-top: 5px;";
  return input;
}

function createCslFileInput(id: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.id = id;
  input.accept = "image/png";
  input.style.cssText = "display: none;";
  return input;
}

function createCslButton(id: string, text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = id;
  btn.textContent = text;
  btn.style.cssText = "padding: 5px 10px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;";
  return btn;
}

// ============================================================================
// UI Setup
// ============================================================================

// Create option group for CSL settings
const cslOptionGroup = createCslElementWithClass("div", "option-group");

// Option 1: Enable Custom Skin
const optionDivCslEnable = createCslElementWithClass("div", "option");
const cslEnableLeftDiv = createCslElementWithClass("div", "left");
const cslEnableLabel = createCslElementWithText("span", "Custom Skin Loader");
const cslEnableDesc = createCslElementWithClass("span", "description", "Enable custom skin texture replacement");
const cslEnableSelect = createCslDropdown("csl_enable", [
  { value: "on", text: "On" },
  { value: "off", text: "Off" }
]);

cslEnableLeftDiv.appendChild(cslEnableLabel);
cslEnableLeftDiv.appendChild(cslEnableDesc);
optionDivCslEnable.appendChild(cslEnableLeftDiv);
optionDivCslEnable.appendChild(cslEnableSelect);

// Option 2: Skin URL
const optionDivCslUrl = createCslElementWithClass("div", "option");
const cslUrlLeftDiv = createCslElementWithClass("div", "left");
const cslUrlLabel = createCslElementWithText("span", "Skin URL");
const cslUrlDesc = createCslElementWithClass("span", "description", "URL to skin texture image (PNG)");
const cslUrlInput = createCslTextInput("csl_url", "https://example.com/skin.png");
cslUrlInput.style.cssText = "width: 200px; padding: 5px; border: 1px solid #444; background: #222; color: #fff; border-radius: 4px;";

cslUrlLeftDiv.appendChild(cslUrlLabel);
cslUrlLeftDiv.appendChild(cslUrlDesc);
optionDivCslUrl.appendChild(cslUrlLeftDiv);
optionDivCslUrl.appendChild(cslUrlInput);

// Option 3: Enable Custom File
const optionDivCslCustomEnable = createCslElementWithClass("div", "option");
const cslCustomEnableLeftDiv = createCslElementWithClass("div", "left");
const cslCustomEnableLabel = createCslElementWithText("span", "Use Custom File");
const cslCustomEnableDesc = createCslElementWithClass("span", "description", "Use uploaded file instead of URL");
const cslCustomEnableSelect = createCslDropdown("csl_custom_enable", [
  { value: "on", text: "On" },
  { value: "off", text: "Off" }
]);

cslCustomEnableLeftDiv.appendChild(cslCustomEnableLabel);
cslCustomEnableLeftDiv.appendChild(cslCustomEnableDesc);
optionDivCslCustomEnable.appendChild(cslCustomEnableLeftDiv);
optionDivCslCustomEnable.appendChild(cslCustomEnableSelect);

// Option 4: File Upload
const optionDivCslFile = createCslElementWithClass("div", "option");
const cslFileLeftDiv = createCslElementWithClass("div", "left");
const cslFileLabel = createCslElementWithText("span", "Upload Skin File");
const cslFileDesc = createCslElementWithClass("span", "description", "Upload a PNG skin texture file");
const cslFileInput = createCslFileInput("csl_file_input");
const cslFileButton = createCslButton("csl_file_button", "Browse...");
const cslFileStatus = createCslElementWithClass("span", "csl-file-status", "No file selected");
cslFileStatus.style.cssText = "margin-left: 10px; color: #888; font-size: 12px;";

const cslFileRightDiv = createCslElementWithClass("div", "right");
cslFileRightDiv.style.cssText = "display: flex; align-items: center;";
cslFileRightDiv.appendChild(cslFileInput);
cslFileRightDiv.appendChild(cslFileButton);
cslFileRightDiv.appendChild(cslFileStatus);

cslFileLeftDiv.appendChild(cslFileLabel);
cslFileLeftDiv.appendChild(cslFileDesc);
optionDivCslFile.appendChild(cslFileLeftDiv);
optionDivCslFile.appendChild(cslFileRightDiv);

// Tooltip for CSL
const cslTooltipContainer = createCslElementWithClass("div", "tooltip-container-GVL");
const cslTooltipIcon = createCslElementWithClass("span", "info-icon-GVL", "i");
const cslTooltipText = createCslElementWithClass("div", "tooltip-text-GVL", "Custom Skin Loader - Replace player skins with custom textures");

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

document.addEventListener("DOMContentLoaded", () => {
  initializeCslLocalStorage();

  setTimeout(() => {
    const container = document.getElementById("scripts-options");
    if (container) {
      container.appendChild(cslOptionGroup);

      // Setup Enable toggle
      const enableSelector = document.getElementById("csl_enable") as HTMLSelectElement;
      if (enableSelector) {
        enableSelector.value = cachedCslEnabled;
        enableSelector.addEventListener("change", () => {
          localStorage.cslEnabled = enableSelector.value;
          syncCslCache();
        });
      }

      // Setup URL input
      const urlInput = document.getElementById("csl_url") as HTMLInputElement;
      if (urlInput) {
        urlInput.value = cachedCslUrl;
        urlInput.addEventListener("change", () => {
          localStorage.cslUrl = urlInput.value;
          syncCslCache();
        });
        urlInput.addEventListener("blur", () => {
          localStorage.cslUrl = urlInput.value;
          syncCslCache();
        });
      }

      // Setup Custom Enable toggle
      const customEnableSelector = document.getElementById("csl_custom_enable") as HTMLSelectElement;
      if (customEnableSelector) {
        customEnableSelector.value = cachedCslCustomEnabled;
        customEnableSelector.addEventListener("change", () => {
          localStorage.cslCustomEnabled = customEnableSelector.value;
          syncCslCache();
        });
      }

      // Setup File input
      const fileInput = document.getElementById("csl_file_input") as HTMLInputElement;
      const fileButton = document.getElementById("csl_file_button") as HTMLButtonElement;
      const fileStatus = document.querySelector(".csl-file-status") as HTMLSpanElement;

      if (fileButton && fileInput) {
        fileButton.addEventListener("click", () => {
          fileInput.click();
        });

        fileInput.addEventListener("change", (e) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            if (!file.type.includes("png")) {
              if (fileStatus) fileStatus.textContent = "Error: Only PNG files allowed";
              return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              localStorage.cslCustomData = dataUrl;
              syncCslCache();
              if (fileStatus) fileStatus.textContent = `Loaded: ${file.name}`;
            };
            reader.onerror = () => {
              if (fileStatus) fileStatus.textContent = "Error reading file";
            };
            reader.readAsDataURL(file);
          }
        });

        // Show status if custom data exists
        if (cachedCslCustomData && fileStatus) {
          fileStatus.textContent = "Custom file loaded";
        }
      }
    }
  }, 1000);
});

// ============================================================================
// Array.isArray Patch for Texture Replacement
// ============================================================================

const oldIsArr = Array.isArray;

(Array.isArray as any) = (...args: any[]): boolean => {
  // Fast path: if first arg doesn't have map.image structure, skip immediately
  const arg = args[0];
  if (!arg || !arg.map || !arg.map.image) {
    return oldIsArr.apply(Array, args);
  }

  const customSkinLink = getActiveSkinUrl();

  // Skip if disabled or no URL configured
  if (!customSkinLink) {
    return oldIsArr.apply(Array, args);
  }

  const image = arg.map.image;
  const { width, height, src } = image;

  // Check if this is a player skin texture (64x64, 64x32, 42x42, 42x32)
  // and NOT a muzzle flash or already-patched texture
  if (
    (width === 64 || width === 42) &&
    (height === 64 || height === 42 || height === 32) &&
    src !== muzzleImg &&
    src !== customSkinLink &&
    !src.includes(muzzleImg2) &&
    !patchedImages.has(image)
  ) {
    image.src = customSkinLink;
    patchedImages.add(image);
  }

  return oldIsArr.apply(Array, args);
};

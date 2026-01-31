// ==UserScript==
// @name         Global Chat Item Prices and Trade Stats
// @description  Add (price) in global chat after each [item], and some trade stats if the offering is good or bad. Also add price to items in Market, Inventory, and also have a Inventory total value per section.
// @version      1.0.1
// @author       SheriffCarry, skywalk
// @github       https://api.github.com/repos/SheriffCarry/KirkaScripts/contents/Userscript/globalChatItemPricesAndTradeStats.js
// ==/UserScript==

// ============================================================================
// Type Definitions
// ============================================================================

interface PriceListConfig {
  name: string;
  type: string;
  price: string;
  rarity: string;
}

interface MappingConfig {
  [key: string]: {
    [configName: string]: PriceListConfig;
  };
}

interface ItemDetails {
  name: string;
  weaponType: string;
  itemType: string;
  quantity: number;
}

interface MessageData {
  message?: string;
  messages?: Array<{ message: string }>;
  testfield?: boolean;
  [key: string]: unknown;
}

interface PriceListEntry {
  itemName?: string;
  type?: string;
  average?: string | number;
  automatic?: string | number;
  bros?: string | number;
  yzzz?: string | number;
  rarity?: string;
  [key: string]: string | number | undefined;
}

interface DropdownOption {
  value: string;
  text: string;
}

// ============================================================================
// Constants & Configuration
// ============================================================================

// Optimization: Use typed array for weapon lookups
const WEAPONS: readonly string[] = ["VITA", "Shark", "LAR", "AR-9", "SCAR", "Weatie", "M60", "Revolver", "Bayonet", "Tomahawk", "MAC-10"] as const;

// Optimization: Cache regex patterns outside functions to avoid recreation
const REGEX_ITEMS_FIX = /\[\s*(.*?)\|(.*?)\|(.*?)\|(.*?)\]x?(\d*)/g;
const REGEX_ITEM_MATCH = /\[([^\|\]]+)\|([^\|\]]*)\|([^\|\]]*)\|([^\|\]]+)](?:x(\d+))?/g;
const REGEX_TRADE_TAG = /\*\*\/trade accept (\d+)\*\*/i;

// Optimization: Define mapping configs with proper typing
const mappingConfigs: MappingConfig = {
  skywalk: {
    default: { name: "itemName", type: "type", price: "average", rarity: "rarity" },
    automatic: { name: "itemName", type: "type", price: "automatic", rarity: "rarity" },
    bros: { name: "itemName", type: "type", price: "bros", rarity: "rarity" },
    yzzz: { name: "itemName", type: "type", price: "yzzz", rarity: "rarity" }
  }
};

// ============================================================================
// Global State Management
// ============================================================================

// Optimization: Cache localStorage values to minimize access
let cachedFavoritePricelist: string;
let cachedFallbackEnable: string;
let cachedFallbackPricelist: string;
let cachedTradeOfferLink: string;
let cachedInventoryTotal: number;
let cachedInventoryTotalWeapons: number;
let cachedInventoryTotalChests: number;
let cachedInventoryTotalCharacters: number;

// Initialize localStorage with default values
function initializeLocalStorage(): void {
  localStorage.globalchatPricesList = "skywalk";

  if (!localStorage.globalFavoritePricelist) {
    localStorage.globalFavoritePricelist = "default";
  }

  if (!localStorage.globalFallbackEnable) {
    localStorage.globalFallbackEnable = "off";
    localStorage.globalFallbackPricelist = "automatic";
  }

  if (!localStorage.globalTradeOfferLink) {
    localStorage.globalTradeOfferLink = "off";
  }

  if (!localStorage.inventoryTotal) {
    localStorage.inventoryTotal = "0";
    localStorage.inventoryTotalWeapons = "0";
    localStorage.inventoryTotalChests = "0";
    localStorage.inventoryTotalCharacters = "0";
  }

  // Cache values after initialization
  syncLocalStorageCache();
}

// Optimization: Sync cache with localStorage (called after updates)
function syncLocalStorageCache(): void {
  cachedFavoritePricelist = localStorage.globalFavoritePricelist;
  cachedFallbackEnable = localStorage.globalFallbackEnable;
  cachedFallbackPricelist = localStorage.globalFallbackPricelist;
  cachedTradeOfferLink = localStorage.globalTradeOfferLink;
  cachedInventoryTotal = Number(localStorage.inventoryTotal);
  cachedInventoryTotalWeapons = Number(localStorage.inventoryTotalWeapons);
  cachedInventoryTotalChests = Number(localStorage.inventoryTotalChests);
  cachedInventoryTotalCharacters = Number(localStorage.inventoryTotalCharacters);
}

// Price list storage
const priceList: { [key: string]: PriceListEntry[] } = {};

// Price list cache
let priceListCacheTimestamp = 0;
const PRICE_LIST_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// ============================================================================
// DOM Element Pooling
// ============================================================================

// Optimization: Object pooling for frequently created elements
class ElementPool {
  private pool: Map<string, HTMLElement[]> = new Map();
  private maxPoolSize = 20;

  get(tagName: string, className?: string): HTMLElement {
    const key = `${tagName}:${className || ''}`;
    const pooled = this.pool.get(key);

    if (pooled && pooled.length > 0) {
      return pooled.pop()!;
    }

    const el = document.createElement(tagName);
    if (className) {
      el.className = className;
    }
    return el;
  }

  release(el: HTMLElement): void {
    const key = `${el.tagName}:${el.className}`;
    let pooled = this.pool.get(key);

    if (!pooled) {
      pooled = [];
      this.pool.set(key, pooled);
    }

    if (pooled.length < this.maxPoolSize) {
      // Clear element state
      el.textContent = '';
      el.removeAttribute('style');
      pooled.push(el);
    }
  }
}

const elementPool = new ElementPool();

// ============================================================================
// Helper Functions
// ============================================================================

function getWeaponClass(item: Element): string | undefined {
  // Optimization: Use traditional for loop instead of .find()
  for (let i = 0, len = WEAPONS.length; i < len; i++) {
    if (item.classList.contains(WEAPONS[i])) {
      return WEAPONS[i];
    }
  }
  return undefined;
}

function createElementWithClass(tagName: string, className: string, textContent: string = ""): HTMLElement {
  const el = document.createElement(tagName);
  el.className = className;
  if (textContent) {
    el.textContent = textContent;
  }
  return el;
}

function createElementWithText(tagName: string, textContent: string): HTMLElement {
  const el = document.createElement(tagName);
  el.textContent = textContent;
  return el;
}

// Optimization: Use traditional for loop instead of forEach
function createDropdown(id: string, options: DropdownOption[]): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.id = id;

  for (let i = 0, len = options.length; i < len; i++) {
    const opt = document.createElement("option");
    opt.value = options[i].value;
    opt.textContent = options[i].text;
    sel.appendChild(opt);
  }

  return sel;
}

function createCheckbox(id: string): HTMLDivElement {
  const cont = createElementWithClass("div", "checkbox") as HTMLDivElement;
  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  checkbox.id = id;
  const checkboxLabel = document.createElement("label");
  checkboxLabel.setAttribute("for", id);
  cont.appendChild(checkbox);
  cont.appendChild(checkboxLabel);
  return cont;
}

// ============================================================================
// UI Setup
// ============================================================================

const optionGroup = createElementWithClass("div", "option-group");
const optionDiv = createElementWithClass("div", "option");
const optionDivFallback = createElementWithClass("div", "option");
const optionDivFallbackEnable = createElementWithClass("div", "option");
const optionDivTradeOfferLink = createElementWithClass("div", "option");

const mappingSelect = createDropdown("global_mapping_config", [
  { value: "default", text: "Default (average)" },
  { value: "automatic", text: "Automatic" },
  { value: "bros", text: "BROS" },
  { value: "yzzz", text: "yzzz" }
]);

const fallbackSelect = createDropdown("global_fallback_config", [
  { value: "default", text: "Default (average)" },
  { value: "automatic", text: "Automatic" },
  { value: "bros", text: "BROS" },
  { value: "yzzz", text: "yzzz" }
]);

const fallbackEnableSelect = createDropdown("global_fallback_enable", [
  { value: "on", text: "On" },
  { value: "off", text: "Off" }
]);

const tradeOfferLinkSelect = createDropdown("global_tradeoffer_link", [
  { value: "on", text: "On" },
  { value: "off", text: "Off" }
]);

const mappingLeftDiv = createElementWithClass("div", "left");
const fallbackLeftDiv = createElementWithClass("div", "left");
const fallbackEnableLeftDiv = createElementWithClass("div", "left");
const tradeOfferLinkLeftDiv = createElementWithClass("div", "left");

const mappingLabel = createElementWithText("span", "Favorite pricelist");
const fallbackLabel = createElementWithText("span", "Fallback pricelist");
const fallbackEnableLabel = createElementWithText("span", "Enable Fallback");
const tradeOfferLinkLabel = createElementWithText("span", "Trade Offer Link");

const mappingDesc = createElementWithClass("span", "description", "Select pricelist to use by default");
const fallbackDesc = createElementWithClass("span", "description", "If favorite pricelist price is 0, fallback to pricelist");
const fallbackEnableDesc = createElementWithClass("span", "description", "Enable fallback feature or not");
const tradeOfferLinkDesc = createElementWithClass("span", "description", "Add clickable publikc:// link to trade offers in chat");

mappingLeftDiv.appendChild(mappingLabel);
mappingLeftDiv.appendChild(mappingDesc);
optionDiv.appendChild(mappingLeftDiv);
optionDiv.appendChild(mappingSelect);

fallbackLeftDiv.appendChild(fallbackLabel);
fallbackLeftDiv.appendChild(fallbackDesc);
optionDivFallback.appendChild(fallbackLeftDiv);
optionDivFallback.appendChild(fallbackSelect);

fallbackEnableLeftDiv.appendChild(fallbackEnableLabel);
fallbackEnableLeftDiv.appendChild(fallbackEnableDesc);
optionDivFallbackEnable.appendChild(fallbackEnableLeftDiv);
optionDivFallbackEnable.appendChild(fallbackEnableSelect);

tradeOfferLinkLeftDiv.appendChild(tradeOfferLinkLabel);
tradeOfferLinkLeftDiv.appendChild(tradeOfferLinkDesc);
optionDivTradeOfferLink.appendChild(tradeOfferLinkLeftDiv);
optionDivTradeOfferLink.appendChild(tradeOfferLinkSelect);

const tooltipContainer = createElementWithClass("div", "tooltip-container-GVL");
const tooltipIcon = createElementWithClass("span", "info-icon-GVL", "i");
const tooltipText = createElementWithClass("div", "tooltip-text-GVL", "Made by SheriffCarry and skywalk v1.0.0");
const tooltipStyle = document.createElement("style");
tooltipStyle.innerHTML = `
.tooltip-container-GVL { position: relative; display: inline-block; cursor: pointer; font-size: 14px; }
.info-icon-GVL { background-color: #444; color: white; border-radius: 50%; padding: 5px; width: 20px; height: 20px; text-align: center; display: inline-block; font-weight: bold; line-height: 20px; }
.tooltip-text-GVL { visibility: hidden; width: 400px; background-color: #333; color: #fff; text-align: center; border-radius: 5px; padding: 10px; position: absolute; z-index: 1; bottom: 125%; left: 50%; transform: translateX(-50%); opacity: 0; transition: opacity 0.3s; white-space: nowrap; }
.tooltip-text-GVL::after { content: ""; position: absolute; top: 100%; left: 50%; margin-left: -5px; border-width: 5px; border-style: solid; border-color: #333 transparent transparent transparent; }
.info-icon-GVL:hover + .tooltip-text-GVL { visibility: visible; opacity: 1; }
`;

tooltipContainer.appendChild(tooltipIcon);
tooltipContainer.appendChild(tooltipText);
optionGroup.appendChild(tooltipContainer);
optionGroup.appendChild(optionDiv);
optionGroup.appendChild(optionDivFallbackEnable);
optionGroup.appendChild(optionDivFallback);
optionGroup.appendChild(optionDivTradeOfferLink);

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchData(listName: string, url: string): Promise<void> {
  try {
    const resp = await fetch(url);
    priceList[listName] = await resp.json();
  } catch {
    priceList[listName] = priceList[listName] || [];
  }
}

async function fetchPriceList(): Promise<boolean> {
  const now = Date.now();

  // Check if cache is still valid (within 15 minutes)
  if (priceListCacheTimestamp > 0 && (now - priceListCacheTimestamp) < PRICE_LIST_CACHE_DURATION) {
    return true;
  }

  await Promise.all([
    fetchData("skywalk", "https://kirka.lukeskywalk.com/finalUpdatedBaseList.json")
  ]);

  // Update cache timestamp after successful fetch
  priceListCacheTimestamp = now;

  return true;
}

// ============================================================================
// Initialization
// ============================================================================

// Optimization: Replace setInterval with requestIdleCallback for better performance
let lastPriceListUpdate = 0;
const PRICE_LIST_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes instead of 1 minute
let priceListUpdateTimeout: number | null = null;

function schedulePriceListUpdate(): void {
  const now = performance.now();
  if (now - lastPriceListUpdate >= PRICE_LIST_UPDATE_INTERVAL) {
    lastPriceListUpdate = now;
    fetchPriceList().then(() => {
      (window as any).priceList = priceList;
    });
  }
  // Schedule next check - store timeout ID for cleanup
  priceListUpdateTimeout = window.setTimeout(schedulePriceListUpdate, PRICE_LIST_UPDATE_INTERVAL);
}

function stopPriceListUpdate(): void {
  if (priceListUpdateTimeout !== null) {
    clearTimeout(priceListUpdateTimeout);
    priceListUpdateTimeout = null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initializeLocalStorage();
  await fetchPriceList();
  (window as any).priceList = priceList;

  // Start periodic updates
  lastPriceListUpdate = performance.now();
  schedulePriceListUpdate();

  setTimeout(() => {
    const container = document.getElementById("scripts-options");
    if (container) {
      container.appendChild(tooltipStyle);
      container.appendChild(optionGroup);

      const mappingSelector = document.getElementById("global_mapping_config") as HTMLSelectElement;
      if (mappingSelector) {
        mappingSelector.value = cachedFavoritePricelist;
        mappingSelector.addEventListener("change", () => {
          localStorage.globalFavoritePricelist = mappingSelect.value;
          syncLocalStorageCache();
        });
      }

      const fallbackEnableSelector = document.getElementById("global_fallback_enable") as HTMLSelectElement;
      if (fallbackEnableSelector) {
        fallbackEnableSelector.value = cachedFallbackEnable;
        fallbackEnableSelector.addEventListener("change", () => {
          localStorage.globalFallbackEnable = fallbackEnableSelector.value;
          syncLocalStorageCache();
        });
      }

      const fallbackSelector = document.getElementById("global_fallback_config") as HTMLSelectElement;
      if (fallbackSelector) {
        fallbackSelector.value = cachedFallbackPricelist;
        fallbackSelector.addEventListener("change", () => {
          localStorage.globalFallbackPricelist = fallbackSelector.value;
          syncLocalStorageCache();
        });
      }

      const tradeOfferLinkSelector = document.getElementById("global_tradeoffer_link") as HTMLSelectElement;
      if (tradeOfferLinkSelector) {
        tradeOfferLinkSelector.value = cachedTradeOfferLink;
        tradeOfferLinkSelector.addEventListener("change", () => {
          localStorage.globalTradeOfferLink = tradeOfferLinkSelector.value;
          syncLocalStorageCache();
        });
      }
    }
  }, 1000);
});

// ============================================================================
// Price Lookup Functions
// ============================================================================

interface CurratedListResult {
  currList: PriceListEntry[];
  currKeys: PriceListConfig;
}

function returnCurratedList(selectedList: string, configKey: string): CurratedListResult {
  const listKey = mappingConfigs[selectedList] ? selectedList : "skywalk";
  const mapObj = mappingConfigs[listKey] || {};
  let currKeys = mapObj[configKey] || mapObj.default;
  if (!currKeys) {
    currKeys = mappingConfigs.skywalk.default;
  }
  const currList = priceList[listKey] || [];
  return { currList, currKeys };
}

function getValue(itemName: string, itemType: string, selectedList: string, configKey: string): number {
  const { currList, currKeys } = returnCurratedList(selectedList, configKey);

  // Optimization: Use traditional for loop instead of .find()
  let item: PriceListEntry | null = null;
  const nameKey = currKeys.name;
  const typeKey = currKeys.type;
  const priceKey = currKeys.price;

  for (let i = 0, len = currList.length; i < len; i++) {
    const entry = currList[i];
    if (entry[nameKey] === itemName && entry[typeKey] === itemType) {
      item = entry;
      break;
    }
  }

  if (!item || item[priceKey] == null) {
    return 0;
  }

  const priceValue = item[priceKey];
  const predelivery = parseFloat(String(priceValue).replace(/[.,]/g, "")) || 0;

  if (predelivery === 0 && cachedFallbackEnable === "on") {
    const { currList: currListFb, currKeys: currKeysFb } = returnCurratedList(selectedList, cachedFallbackPricelist);

    const nameKeyFb = currKeysFb.name;
    const typeKeyFb = currKeysFb.type;
    const priceKeyFb = currKeysFb.price;

    let itemFb: PriceListEntry | null = null;
    for (let i = 0, len = currListFb.length; i < len; i++) {
      const entry = currListFb[i];
      if (entry[nameKeyFb] === itemName && entry[typeKeyFb] === itemType) {
        itemFb = entry;
        break;
      }
    }

    if (!itemFb || itemFb[priceKeyFb] == null) {
      return 0;
    }

    const priceValueFb = itemFb[priceKeyFb];
    return parseFloat(String(priceValueFb).replace(/[.,]/g, "")) || 0;
  }

  return predelivery;
}

function getValueByRarity(itemName: string, itemRarity: string, selectedList: string = localStorage.globalchatPricesList, configKey: string = cachedFavoritePricelist): number {
  const { currList, currKeys } = returnCurratedList(selectedList, configKey);

  // Optimization: Use traditional for loop
  const nameKey = currKeys.name;
  const rarityKey = currKeys.rarity;
  const priceKey = currKeys.price;

  let item: PriceListEntry | null = null;
  for (let i = 0, len = currList.length; i < len; i++) {
    const entry = currList[i];
    if (entry[nameKey] === itemName && entry[rarityKey] === itemRarity) {
      item = entry;
      break;
    }
  }

  if ((!item || item[priceKey] == null) && cachedFallbackEnable === 'off') {
    return 0;
  }

  const priceValue = item ? item[priceKey] : null;
  const predelivery = priceValue ? parseFloat(String(priceValue).replace(/[.,]/g, "")) || 0 : 0;

  if (predelivery === 0 && cachedFallbackEnable === "on") {
    const { currList: currListFb, currKeys: currKeysFb } = returnCurratedList(selectedList, cachedFallbackPricelist);

    const nameKeyFb = currKeysFb.name;
    const rarityKeyFb = currKeysFb.rarity;
    const priceKeyFb = currKeysFb.price;

    let itemFb: PriceListEntry | null = null;
    for (let i = 0, len = currListFb.length; i < len; i++) {
      const entry = currListFb[i];
      if (entry[nameKeyFb] === itemName && entry[rarityKeyFb] === itemRarity) {
        itemFb = entry;
        break;
      }
    }

    if (!itemFb || itemFb[priceKeyFb] == null) {
      return 0;
    }

    const priceValueFb = itemFb[priceKeyFb];
    return parseFloat(String(priceValueFb).replace(/[.,]/g, "")) || 0;
  }

  return predelivery;
}

function searchItemByType(itemName: string, itemType: string, configKey: string = cachedFavoritePricelist): number {
  const selectedList = localStorage.globalchatPricesList || "skywalk";
  return getValue(itemName, itemType, selectedList, configKey);
}

function returnItemType(weaponType: string, itemType: string): string {
  return itemType === "BODY_SKIN" ? "Character"
    : itemType === "WEAPON_SKIN" ? weaponType
    : itemType === "CHEST" ? "Chest"
    : itemType === "CARD" ? "Card" : "";
}

// ============================================================================
// Formatting Functions
// ============================================================================

function formatNumberWithCommas(number: number): string {
  if (number === undefined || number === null) {
    return "0";
  }
  return number.toLocaleString("en-US");
}

function formatNumber(number: number): string {
  if (!number) {
    return "0";
  }
  const abs = Math.abs(number);
  const suffix = abs >= 1e9 ? "bil" : abs >= 1e6 ? "mil" : abs >= 1e3 ? "k" : "";
  const divisor = suffix === "bil" ? 1e9 : suffix === "mil" ? 1e6 : suffix === "k" ? 1e3 : 1;
  const num = (abs / divisor).toFixed(abs % 1 ? 1 : 0);
  return (number < 0 ? "-" : "") + num + suffix;
}

// ============================================================================
// Message Processing
// ============================================================================

// Optimization: Replace spread operator with traditional loop for matchAll
function trimsplit(x: string): string[] {
  const parts: string[] = [];
  let lastIndex = 0;

  // Reset regex before use
  REGEX_ITEMS_FIX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = REGEX_ITEMS_FIX.exec(x)) !== null) {
    if (match.index !== lastIndex) {
      parts.push(x.slice(lastIndex, match.index));
    }
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex !== x.length) {
    parts.push(x.slice(lastIndex));
  }

  return parts;
}

function trimMessage(messageSplit: string[]): string {
  let newMessage = "";
  let isOffering = true;
  let offeringTotal = 0;
  let wantedTotal = 0;
  let favorableTrade = "";
  const myItems: Array<{name: string, quantity: number}> = [];
  const yourItems: Array<{name: string, quantity: number}> = [];
  let extractedTradeId = "";

  // Optimization: Cache length in loop
  for (let i = 0, len = messageSplit.length; i < len; i++) {
    const segment = messageSplit[i];

    // Optimization: Reset regex before use
    REGEX_ITEM_MATCH.lastIndex = 0;

    const itemDetails: ItemDetails[] = [];
    let itemMatch: RegExpExecArray | null;

    // Optimization: Use traditional loop instead of spread operator
    while ((itemMatch = REGEX_ITEM_MATCH.exec(segment)) !== null) {
      itemDetails.push({
        name: itemMatch[1],
        weaponType: itemMatch[2],
        itemType: itemMatch[3],
        quantity: parseInt(itemMatch[5] || "1")
      });
    }

    if (REGEX_TRADE_TAG.test(segment)) {
      favorableTrade = (offeringTotal === 0 || wantedTotal === 0) ? "New item?" : "";
      const parts = segment.trim().split("**");
      const prefix = parts[0];
      const tradeId = parts[1];
      extractedTradeId = tradeId || "";

      // Generate trade offer URL if enabled
      let tradeOfferMarker = "";
      if (cachedTradeOfferLink === "on") {
        tradeOfferMarker = " %%TRADE_OFFER_LINK%% ";
      }

      newMessage += " [" + formatNumber(wantedTotal) + "] Status: " + (offeringTotal - wantedTotal > 0 ? '+' : '') + formatNumber(offeringTotal - wantedTotal) + (favorableTrade !== '' ? ' ' + favorableTrade : '') + tradeOfferMarker + " " + prefix + "**" + tradeId + "** ";
    } else {
      if (segment.includes("for your")) {
        isOffering = false;
        newMessage += " [" + formatNumber(offeringTotal) + "] " + segment;
      } else {
        // Optimization: Use traditional for loop
        for (let j = 0, detailsLen = itemDetails.length; j < detailsLen; j++) {
          const detail = itemDetails[j];
          const pricelistItemType = returnItemType(detail.weaponType, detail.itemType);
          const itemPrice = searchItemByType(detail.name, pricelistItemType);
          const totalItemPrice = detail.quantity * itemPrice;

          if (isOffering) {
            offeringTotal += totalItemPrice;
            myItems.push({name: detail.name, quantity: detail.quantity});
          } else {
            wantedTotal += totalItemPrice;
            yourItems.push({name: detail.name, quantity: detail.quantity});
          }

          newMessage += segment + " (" + (detail.quantity > 1 ? detail.quantity + "x" + formatNumber(itemPrice) + "= " : '') + formatNumber(totalItemPrice) + ")";
        }

        if (itemDetails.length === 0) {
          newMessage += segment;
        }
      }
    }
  }

  // Replace marker with actual trade offer URL
  if (cachedTradeOfferLink === "on" && newMessage.includes("%%TRADE_OFFER_LINK%%")) {
    let tradeStringUrl = "publikc://tradeoffer?";
    let nonceYour = 1;
    let nonceFor = 1;

    yourItems.forEach(({name, quantity}) => {
      if (nonceYour === 1) {
        tradeStringUrl += `your${nonceYour}=${encodeURIComponent(name)}&yourq${nonceYour}=${quantity}`;
      } else {
        tradeStringUrl += `&your${nonceYour}=${encodeURIComponent(name)}&yourq${nonceYour}=${quantity}`;
      }
      nonceYour += 1;
    });

    myItems.forEach(({name, quantity}) => {
      if (nonceFor === 1 && yourItems.length === 0) {
        tradeStringUrl += `for${nonceFor}=${encodeURIComponent(name)}&forq${nonceFor}=${quantity}`;
      } else {
        tradeStringUrl += `&for${nonceFor}=${encodeURIComponent(name)}&forq${nonceFor}=${quantity}`;
      }
      nonceFor += 1;
    });

    // Add trade ID to URL if available
    if (extractedTradeId) {
      tradeStringUrl += `&tradeId=${encodeURIComponent(extractedTradeId)}`;
    }

    // Store the URL for later DOM injection
    (window as any).__tradeOfferUrlMap = (window as any).__tradeOfferUrlMap || new Map();
    const uniqueMarker = `%%TRADE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}%%`;
    (window as any).__tradeOfferUrlMap.set(uniqueMarker, tradeStringUrl);

    newMessage = newMessage.replace("%%TRADE_OFFER_LINK%%", uniqueMarker);
  }

  return newMessage;
}

// ============================================================================
// WebSocket Interception
// ============================================================================

const originalWebSocket = window.WebSocket;

// Track our listeners for cleanup (not the WebSockets themselves)
const messageHandlers = new WeakMap<WebSocket, (event: MessageEvent) => void>();
const closeHandlers = new WeakMap<WebSocket, () => void>();
const errorHandlers = new WeakMap<WebSocket, () => void>();

type WebSocketConstructor = new (url: string, protocols?: string | string[]) => WebSocket;

(window as any).WebSocket = function(this: WebSocket, ...args: [string, (string | string[])?]): WebSocket {
  const wsUrl = args[0];

  if (wsUrl.includes("chat.")) {
    const ws = new originalWebSocket(...args);

    // Create named function so it can be removed
    const messageHandler = function(event: MessageEvent): void {
      try {
        let messageData: MessageData = JSON.parse(event.data);

        // Optimization: Check testfield first to avoid processing already-processed messages
        if (messageData.testfield) {
          return;
        }

        if (messageData.message) {
          const msgSplit = trimsplit(messageData.message);
          const newMessageArray = trimMessage(msgSplit);
          messageData.message = newMessageArray;
          messageData.testfield = true;
          event.stopImmediatePropagation();

          const modifiedEvent = new MessageEvent("message", {
            data: JSON.stringify(messageData),
            origin: event.origin,
            lastEventId: event.lastEventId,
            source: event.source,
            ports: Array.from(event.ports)
          });

          ws.dispatchEvent(modifiedEvent);
        } else if (messageData.messages) {
          const newmessages: Array<{ message: string }> = [];
          const messages = messageData.messages;

          // Optimization: Use traditional for loop instead of forEach
          for (let i = 0, len = messages.length; i < len; i++) {
            const item = messages[i];
            const msgSplit = trimsplit(item.message);
            const newMessageArray = trimMessage(msgSplit);
            item.message = newMessageArray;
            newmessages.push(item);
          }

          messageData.messages = newmessages;
          messageData.testfield = true;
          event.stopImmediatePropagation();

          const modifiedEvent = new MessageEvent("message", {
            data: JSON.stringify(messageData),
            origin: event.origin,
            lastEventId: event.lastEventId,
            source: event.source,
            ports: Array.from(event.ports)
          });

          ws.dispatchEvent(modifiedEvent);
        }
      } catch (e) {
        console.error("Error processing WebSocket message:", e);
      }
    };

    // Store handlers in WeakMap for potential cleanup
    messageHandlers.set(ws, messageHandler);

    ws.addEventListener("message", messageHandler);

    // Auto-cleanup our listeners when WebSocket closes (game handles the close)
    const closeHandler = (): void => {
      ws.removeEventListener("message", messageHandler);
      ws.removeEventListener("close", closeHandler);
      ws.removeEventListener("error", errorHandler);

      // WeakMap will auto-cleanup when ws is garbage collected
      messageHandlers.delete(ws);
      closeHandlers.delete(ws);
      errorHandlers.delete(ws);
    };

    const errorHandler = (): void => {
      closeHandler();
    };

    closeHandlers.set(ws, closeHandler);
    errorHandlers.set(ws, errorHandler);

    ws.addEventListener("close", closeHandler);
    ws.addEventListener("error", errorHandler);

    return ws;
  }

  return new originalWebSocket(...args);
};

// Note: We don't need a cleanup function for WebSockets since:
// 1. The game manages WebSocket lifecycle (open/close)
// 2. Our listeners auto-cleanup on close/error
// 3. WeakMaps auto-cleanup when WebSockets are garbage collected

// ============================================================================
// Inventory Processing
// ============================================================================

// Optimization: Cache DOM queries
let cachedInventory: HTMLElement | null = null;
let cachedInventoryTimestamp = 0;
const CACHE_DURATION = 500; // Cache DOM queries for 500ms

function processInventoryItems(): void {
  // Optimization: Use cached DOM query if still valid
  const now = performance.now();
  if (!cachedInventory || now - cachedInventoryTimestamp > CACHE_DURATION) {
    cachedInventory = document.querySelector(".inventory");
    cachedInventoryTimestamp = now;
  }

  const inventory = cachedInventory;
  if (!inventory) {
    return;
  }

  const isMarket = document.querySelector(".hub-container") !== null;
  const subjects = inventory.querySelectorAll(".content .subjects .subject");
  let inventoryTotal = 0;
  let currentInventoryType: string | null = null;
  let isMixed = false;
  const currentWeapons: string[] = [];

  // Optimization: Batch DOM operations
  const domOperations: Array<() => void> = [];

  // Optimization: Use traditional for loop instead of forEach
  for (let i = 0, len = subjects.length; i < len; i++) {
    const subject = subjects[i] as HTMLElement;

    if (!subject.dataset.priceInjected) {
      const itemNameElem = subject.querySelector(".hover-btns-group .item-name") as HTMLElement;
      const countElem = subject.querySelector(".bottom-subj .count") as HTMLElement;
      const rarSkinElem = subject.querySelector(".rar-skin") as HTMLElement;
      const pricePositionElem = subject.querySelector(".hover-btns-group .item-name");

      if (itemNameElem && rarSkinElem && pricePositionElem) {
        const itemName = itemNameElem.textContent?.trim() || "";
        const count = isMarket && countElem ? 1 : (countElem ? parseInt(countElem.textContent?.trim() || "1") : 1);
        let subjectType: string | null = null;

        if (subject.classList.contains("character-card")) {
          subjectType = "Card";
          currentInventoryType = 'Chest';
        } else if (subject.classList.contains("chest")) {
          subjectType = "Chest";
          currentInventoryType = 'Chest';
        } else if (subject.classList.contains("body-skin")) {
          currentInventoryType = 'Character';
        } else if (subject.classList.contains("weapon-skin")) {
          currentInventoryType = 'Weapon';
          const currentWeapon = getWeaponClass(subject);
          if (currentWeapon && currentWeapons.indexOf(currentWeapon) === -1) {
            currentWeapons.push(currentWeapon);
            if (currentWeapons.length > 1) {
              isMixed = true;
            }
          }
        }

        let pricePerItem = 0;

        if (subjectType) {
          pricePerItem = searchItemByType(itemName, subjectType);
        } else {
          // Optimization: Cache getComputedStyle result
          const computedStyle = window.getComputedStyle(rarSkinElem);
          const bg = computedStyle.backgroundImage;
          let rarity: string;

          if (bg.includes("rgb(137, 4, 20)")) {
            rarity = "M";
          } else if (bg.includes("rgb(255, 133, 45)")) {
            rarity = "L";
          } else if (bg.includes("rgb(162, 45, 255)")) {
            rarity = "E";
          } else if (bg.includes("rgb(24, 99, 198)")) {
            rarity = "R";
          } else if (bg.includes("rgb(101, 213, 139)")) {
            rarity = "C";
          } else {
            rarity = "U";
          }

          pricePerItem = getValueByRarity(itemName, rarity);
        }

        const totalPrice = isMarket ? pricePerItem : (pricePerItem * count);

        // Optimization: Batch DOM creation
        const priceInfo = document.createElement("div");
        priceInfo.className = "price-info";

        // Optimization: Set styles in single batch
        const styles: { [key: string]: string } = {
          position: "absolute",
          bottom: "0",
          left: "0",
          backgroundColor: "rgba(0,0,0,0.6)",
          color: "#fff",
          padding: "2px 4px",
          fontSize: "10px",
          lineHeight: "1.2",
          textAlign: "left"
        };

        Object.assign(priceInfo.style, styles);

        if (isMarket) {
          priceInfo.innerHTML = formatNumberWithCommas(pricePerItem);
        } else {
          priceInfo.innerHTML = "(" + formatNumberWithCommas(totalPrice) + ")<br/>" + formatNumberWithCommas(pricePerItem);
        }

        // Optimization: Queue DOM operations
        domOperations.push(() => {
          if (getComputedStyle(subject).position === "static") {
            subject.style.position = "relative";
          }
          subject.appendChild(priceInfo);
          subject.dataset.priceInjected = "true";
          subject.dataset.totalPrice = String(totalPrice);
        });
      }
    }

    if (!isMarket && subject.dataset.totalPrice) {
      inventoryTotal += parseFloat(subject.dataset.totalPrice);
    }
  }

  // Optimization: Execute all DOM operations in batch
  for (let i = 0, len = domOperations.length; i < len; i++) {
    domOperations[i]();
  }

  if (!isMarket) {
    const filterNameElem = inventory.querySelector(".content .filters .filter-name");
    if (filterNameElem) {
      let inventoryTotalElem = document.getElementById("inventory-total");
      if (!inventoryTotalElem) {
        inventoryTotalElem = document.createElement("div");
        inventoryTotalElem.id = "inventory-total";
        filterNameElem.insertAdjacentElement("afterend", inventoryTotalElem);
      }

      if (currentInventoryType === 'Weapon' && isMixed) {
        cachedInventoryTotalWeapons = inventoryTotal;
        localStorage.inventoryTotalWeapons = String(inventoryTotal);
      } else if (currentInventoryType === 'Character') {
        cachedInventoryTotalCharacters = inventoryTotal;
        localStorage.inventoryTotalCharacters = String(inventoryTotal);
      } else if (currentInventoryType === 'Chest') {
        cachedInventoryTotalChests = inventoryTotal;
        localStorage.inventoryTotalChests = String(inventoryTotal);
      }

      cachedInventoryTotal = cachedInventoryTotalCharacters + cachedInventoryTotalWeapons + cachedInventoryTotalChests;
      localStorage.inventoryTotal = String(cachedInventoryTotal);

      inventoryTotalElem.textContent = "Total " + cachedFavoritePricelist + ": " + formatNumberWithCommas(inventoryTotal) + " (" + formatNumberWithCommas(cachedInventoryTotal) + ")";
    }
  }
}

// Optimization: Replace setInterval with requestAnimationFrame for better performance
let lastInventoryUpdate = 0;
const INVENTORY_UPDATE_INTERVAL = 2000; // 2 seconds instead of 1 second
let inventoryUpdateFrameId: number | null = null;
let isInventoryProcessingActive = false;

function scheduleInventoryUpdate(): void {
  if (!isInventoryProcessingActive) return;

  inventoryUpdateFrameId = requestAnimationFrame((timestamp) => {
    if (timestamp - lastInventoryUpdate >= INVENTORY_UPDATE_INTERVAL) {
      lastInventoryUpdate = timestamp;

      // Only process if inventory is visible
      const inventory = document.querySelector(".inventory");
      if (inventory) {
        processInventoryItems();
      }
    }
    scheduleInventoryUpdate();
  });
}

function startInventoryProcessing(): void {
  if (!isInventoryProcessingActive) {
    isInventoryProcessingActive = true;
    scheduleInventoryUpdate();
  }
}

function stopInventoryProcessing(): void {
  isInventoryProcessingActive = false;
  if (inventoryUpdateFrameId !== null) {
    cancelAnimationFrame(inventoryUpdateFrameId);
    inventoryUpdateFrameId = null;
  }
}

// Start inventory processing
startInventoryProcessing();

// ============================================================================
// Trade Offer Link DOM Injection
// ============================================================================

// Store URLs globally for click handler
(window as any).__tradeOfferUrls = (window as any).__tradeOfferUrls || {};

// MutationObserver to replace markers with actual clickable links
const tradeOfferObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;

          // Check if this is a chat message
          const textContent = element.textContent || '';
          if (textContent.includes('%%TRADE_')) {
            // Skip if already processed
            if (element.dataset.tradeLinksProcessed === 'true') return;

            const urlMap = (window as any).__tradeOfferUrlMap;
            if (urlMap) {
              urlMap.forEach((url: string, marker: string) => {
                if (textContent.includes(marker)) {
                  // Generate a simple ID for this trade
                  const tradeId = marker.replace(/%%TRADE_|%%/g, '');

                  // Store URL globally
                  (window as any).__tradeOfferUrls[tradeId] = url;

                  // Find all text nodes containing the marker
                  const walker = document.createTreeWalker(
                    element,
                    NodeFilter.SHOW_TEXT,
                    null
                  );

                  const nodesToReplace: Array<{node: Text, marker: string, tradeId: string}> = [];
                  let currentNode = walker.nextNode() as Text | null;

                  while (currentNode) {
                    if (currentNode.textContent?.includes(marker)) {
                      nodesToReplace.push({node: currentNode, marker: marker, tradeId: tradeId});
                    }
                    currentNode = walker.nextNode() as Text | null;
                  }

                  // Replace markers with links
                  nodesToReplace.forEach(({node, marker, tradeId}) => {
                    const text = node.textContent || '';
                    const parts = text.split(marker);

                    if (parts.length > 1) {
                      const fragment = document.createDocumentFragment();

                      parts.forEach((part, index) => {
                        if (index > 0) {
                          // Create clickable link with onclick attribute
                          const link = document.createElement('a');
                          link.href = 'javascript:void(0)';
                          link.textContent = '[Open Trade]';
                          link.style.color = '#4CAF50';
                          link.style.textDecoration = 'underline';
                          link.style.cursor = 'pointer';
                          link.style.fontWeight = 'bold';
                          link.setAttribute('onclick', `(function(){ var url = window.__tradeOfferUrls['${tradeId}']; if(url) { console.log('[Trade Link] Opening:', url); try { require('electron').shell.openExternal(url); } catch(e) { console.error('[Trade Link] Error:', e); } } })()`);
                          link.classList.add('trade-offer-link');

                          fragment.appendChild(link);
                        }
                        if (part) {
                          fragment.appendChild(document.createTextNode(part));
                        }
                      });

                      node.parentNode?.replaceChild(fragment, node);

                      // Mark element as processed
                      element.dataset.tradeLinksProcessed = 'true';

                      // Don't delete marker - keep it in case chat re-renders
                      // urlMap.delete(marker);
                    }
                  });
                }
              });
            }
          }
        }
      });
    }
  }
});

// Process existing messages that already contain markers
function processExistingTradeOfferLinks(): void {
  const urlMap = (window as any).__tradeOfferUrlMap;
  if (!urlMap || urlMap.size === 0) return;

  // Find all elements that contain trade offer markers
  const allElements = document.querySelectorAll('*');

  allElements.forEach((element) => {
    const textContent = element.textContent || '';
    if (textContent.includes('%%TRADE_')) {
      // Skip if already processed
      const htmlElement = element as HTMLElement;
      if (htmlElement.dataset.tradeLinksProcessed === 'true') return;

      urlMap.forEach((url: string, marker: string) => {
        if (textContent.includes(marker)) {
          // Generate a simple ID for this trade
          const tradeId = marker.replace(/%%TRADE_|%%/g, '');

          // Store URL globally
          (window as any).__tradeOfferUrls[tradeId] = url;

          // Find all text nodes containing the marker
          const walker = document.createTreeWalker(
            htmlElement,
            NodeFilter.SHOW_TEXT,
            null
          );

          const nodesToReplace: Array<{node: Text, marker: string, tradeId: string}> = [];
          let currentNode = walker.nextNode() as Text | null;

          while (currentNode) {
            if (currentNode.textContent?.includes(marker)) {
              nodesToReplace.push({node: currentNode, marker: marker, tradeId: tradeId});
            }
            currentNode = walker.nextNode() as Text | null;
          }

          // Replace markers with links
          nodesToReplace.forEach(({node, marker, tradeId}) => {
            const text = node.textContent || '';
            const parts = text.split(marker);

            if (parts.length > 1) {
              const fragment = document.createDocumentFragment();

              parts.forEach((part, index) => {
                if (index > 0) {
                  // Create clickable link with onclick attribute
                  const link = document.createElement('a');
                  link.href = 'javascript:void(0)';
                  link.textContent = '[Open Trade]';
                  link.style.color = '#4CAF50';
                  link.style.textDecoration = 'underline';
                  link.style.cursor = 'pointer';
                  link.style.fontWeight = 'bold';
                  link.setAttribute('onclick', `(function(){ var url = window.__tradeOfferUrls['${tradeId}']; if(url) { console.log('[Trade Link] Opening:', url); try { require('electron').shell.openExternal(url); } catch(e) { console.error('[Trade Link] Error:', e); } } })()`);
                  link.classList.add('trade-offer-link');

                  fragment.appendChild(link);
                }
                if (part) {
                  fragment.appendChild(document.createTextNode(part));
                }
              });

              node.parentNode?.replaceChild(fragment, node);

              // Mark element as processed
              htmlElement.dataset.tradeLinksProcessed = 'true';
            }
          });
        }
      });
    }
  });

  console.log('[Trade Offer Link] Processed existing messages');
}

// Start observing chat messages
function startTradeOfferLinkObserver(): void {
  // Wait for chat container to exist
  const checkChatContainer = setInterval(() => {
    const chatContainer = document.querySelector('.chat-messages, .messages, [class*="chat"]');
    if (chatContainer) {
      clearInterval(checkChatContainer);

      // Process any existing messages first
      processExistingTradeOfferLinks();

      // Then start observing for new messages
      tradeOfferObserver.observe(chatContainer, {
        childList: true,
        subtree: true
      });
      console.log('[Trade Offer Link] Observer started');
    }
  }, 1000);
}

// Start observer when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startTradeOfferLinkObserver);
} else {
  startTradeOfferLinkObserver();
}

// ============================================================================
// Global Cleanup
// ============================================================================

// Expose cleanup functions globally for manual cleanup if needed
(window as any).globalChatStatsCleanup = function(): void {
  stopPriceListUpdate();
  stopInventoryProcessing();
  tradeOfferObserver.disconnect();
  // Note: WebSocket listeners auto-cleanup, no manual cleanup needed
};

// Optional: Auto-cleanup on page unload (commented out by default)
// window.addEventListener('beforeunload', () => {
//   (window as any).globalChatStatsCleanup();
// });

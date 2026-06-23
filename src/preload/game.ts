import Menu from "./menu";
import { opener } from "../addons/opener";
import { customReqScripts } from "../addons/customReqScripts";
import { swapperMenu } from "../addons/swapperMenu";
import { installWeaponHook } from "../addons/weaponMods";
import { initRoomPresets } from "../addons/roomPresets";
import { initLocalCustomizations, buildLocalCustomization } from "../addons/localCustomizations";
import { initAdsPower } from "../addons/adsPower";
import { ipcRenderer } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { Settings, NewsItem, UserCustomization, NotificationData, SettingsChangedEvent, MapImages, ClanCustomization } from '../types';

const scriptsPath: string = ipcRenderer.sendSync("get-scripts-path");
const scripts: string[] = fs.readdirSync(scriptsPath);

const settings: Settings = ipcRenderer.sendSync("get-settings");
const base_url: string = settings.base_url;

document.addEventListener("juice-settings-changed", (event: Event) => {
  const e = event as SettingsChangedEvent;
  settings[e.detail.setting] = e.detail.value;
});

const cleanupTasks: (() => void)[] = [];
const addCleanupTask = (task: () => void): void => {
  cleanupTasks.push(task);
};
const runCleanup = (): void => {
  cleanupTasks.forEach(fn => {
    try {
      fn();
    } catch {}
  });
  cleanupTasks.length = 0;
};

// Rotation-proof capture of the logged-in player. Kirka's own authenticated API
// responses include the player's user object, and while the endpoint PATHS are
// obfuscated and rotate (the thing that broke the opener), the `shortId` field
// name is stable. So instead of hardcoding an endpoint, we wrap window.fetch at
// preload load — before Kirka's bundle runs — and grab the first kirka.io API
// response that carries a shortId (on load that's the authenticated /me call).
// `resolveCurrentUser` (below) consumes this, with the DOM scrape as fallback.
// contextIsolation is false, so this wrapper is shared with the page's fetch.
// Kirka's user object is opaque (server shape, partly obfuscated); we only read
// its `shortId`, so it's typed loosely.
let currentUserFromNetwork: { shortId: string } | null = null;

// Pulls Kirka's `csrf` request header out of whatever shape fetch was called
// with (plain object / Headers / entry array). Kirka requires it on POST
// mutations (e.g. opening chests); we capture it from Kirka's own traffic and
// stash it so the opener can replay authenticated POSTs without hardcoding it.
const extractCsrf = (headers: HeadersInit | undefined): string => {
  if (!headers) return "";
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get("csrf") || "";
  if (Array.isArray(headers)) {
    const found = headers.find((h) => String(h[0]).toLowerCase() === "csrf");
    return found ? found[1] : "";
  }
  const h = headers as Record<string, string>;
  return h.csrf || h.CSRF || h.Csrf || "";
};

(() => {
  const realFetch = window.fetch;
  if (typeof realFetch !== "function") return;
  let done = false;

  window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const promise = realFetch.call(this, input as RequestInfo, init);
    const url = typeof input === "string" ? input : (input as Request)?.url || String(input);
    if (/\bkirka\.io\/api\//.test(url)) {
      // Keep the latest CSRF token current (not gated by `done`).
      try {
        const csrf = extractCsrf(init?.headers);
        if (csrf) localStorage.setItem("publikc-csrf", csrf);
      } catch {}

      // Capture the logged-in user once (see resolveCurrentUser).
      if (!done) {
        promise
          .then((res) => {
            if (done) return;
            res
              .clone()
              .json()
              .then((data: any) => {
                if (done || !data || typeof data !== "object") return;
                if (typeof data.shortId !== "string" || !data.shortId) return;
                done = true;
                currentUserFromNetwork = data;
                localStorage.setItem("current-user", JSON.stringify(data));
                document.dispatchEvent(new CustomEvent("publikc-current-user-resolved"));
              })
              .catch(() => {});
          })
          .catch(() => {});
      }
    }
    return promise;
  } as typeof window.fetch;
})();

// CSS that pins the in-game scoreboard (free-for-all `.tab-info` and team
// `.tab-team-info` variants) to the top-right corner and keeps it visible at
// all times, with a compact dark card style and RED/BLUE team headers.
const permanentScoreboardCSS: string = [
  ".tab-info, .tab-team-info { display: flex !important; position: absolute; top: 0 !important; right: 0 !important; margin: 0.5rem !important; padding: 0.15rem !important; width: 35rem !important; max-width: 30rem !important; border-radius: 0.5rem !important; }",
  ".tab-team-info .players-cont { flex-direction: column !important; }",
  ".tab-info .player-list, .tab-team-info .player-list { margin: unset !important; gap: 0.25rem; }",
  ".tab-info > .head, .tab-team-info > .head { display: none; }",
  '.tab-team-info .player-list:nth-child(1)::before { content: "RED"; width: 100%; text-align: left; padding: 0.25rem 0.5rem; font-size: 1.25rem; background-color: #ff4d42; border-radius: 0.25rem; box-sizing: border-box; }',
  '.tab-team-info .player-list:nth-child(2)::before { content: "BLUE"; width: 100%; text-align: left; padding: 0.25rem 0.5rem; font-size: 1.25rem; background-color: #0d6dc6; border-radius: 0.25rem; box-sizing: border-box; margin-top: 0.5rem; }',
  ".players-wrap .list { display: none !important; }",
  ".tab-info .list, .tab-team-info .player-list > .list { order: 999; }",
  ".tab-info .players-wrap, .tab-team-info .players-wrap { padding: 0.25rem; }",
  ".tab-info .player-cont, .tab-team-info .player-cont { margin: unset; }",
  ".kill-bar-cont { right: 37.5rem !important; }",
  ".tab-info { background: #141414a3 !important; border-radius: 0.25rem !important; max-width: 35rem !important; }",
  ".tab-info .head { background: linear-gradient(90deg, #ff932d, transparent) !important; border: unset; font-style: normal; border-top-left-radius: 0.25rem; }",
  ".tab-info .head .server-id { display: none; }",
  ".tab-info .list-value { color: #acfa70; }",
  ".tab-team-info { background: #141414a3 !important; border-radius: 0.25rem !important; max-width: 60rem !important; }",
  ".tab-team-info .head { background: transparent !important; }",
  ".tab-team-info .label.red { border-top-left-radius: 0.25rem; background: linear-gradient(90deg, #ff4c4c, #141414a3); justify-content: flex-start; padding-left: 0.75rem; }",
  ".tab-team-info .label.blue { border-top-right-radius: 0.25rem; background: linear-gradient(-90deg, #4476ff, #141414a3); justify-content: flex-end; padding-right: 0.75rem; }",
  ".player-list .list-value { color: #acfa70; }",
  ".player-list .player-cont { background: #141414a3 !important; border-radius: 0.25rem; padding: 0.25rem; }",
  ".player-cont .nickname.bolder { color: #edb846; }",
].join("");

let customizationsMap = new Map<string, UserCustomization>();
const updateCustomizationsMap = (customizations: UserCustomization[]): void => {
  customizationsMap.clear();
  if (customizations && Array.isArray(customizations)) {
    for (let i = 0; i < customizations.length; i++) {
      customizationsMap.set(customizations[i].shortId, customizations[i]);
    }
  }
};

// Per-player local nicknames: { [shortId]: { original, nickname } }.
const readNicknames = (): Record<string, { original?: string; nickname?: string }> => {
  try {
    return JSON.parse(localStorage.getItem("nicknames") || "{}");
  } catch {
    return {};
  }
};

// Replaces only the name text node of an element, leaving children (e.g. badge
// containers) intact, and skips work if it already shows the target text.
const setNameTextNode = (el: HTMLElement | null, text: string): void => {
  if (!el) return;
  const node = Array.from(el.childNodes).find(
    (n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue || "").trim() !== ""
  ) as Text | undefined;
  if (node && (node.nodeValue || "").trim() !== text) node.nodeValue = text;
};

// Clan-tag gradients, keyed by clan tag text, sourced from publikc's backend.
const clansMap = new Map<string, ClanCustomization>();
const updateClansMap = (clans: ClanCustomization[]): void => {
  clansMap.clear();
  if (clans && Array.isArray(clans)) {
    for (let i = 0; i < clans.length; i++) clansMap.set(clans[i].clan, clans[i]);
  }
};

if (!window.location.href.startsWith(base_url)) {
  (window as any).process = undefined;
  (window as any).require = undefined;
} else {
  // Install the WebGL viewmodel hook before any game code can create the
  // canvas context, so weapon tweaks apply from the first frame.
  installWeaponHook(settings);
  initAdsPower(settings);

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    if (!script.endsWith(".js")) continue;
    const scriptPath = path.join(scriptsPath, script);
    try {
      require(scriptPath);
    } catch {}
  }
}

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  trace: console.trace.bind(console),
};

document.addEventListener("DOMContentLoaded", async () => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.trace = originalConsole.trace;

  const menu = new Menu();
  menu.init();

  swapperMenu();
  initRoomPresets();
  initLocalCustomizations();
  opener();
  customReqScripts(settings);

  // Overrides the current user's entry in the customizations map with their
  // locally-built gradient/badges when local customization is enabled.
  const injectLocalCustomization = (): void => {
    if (!settings.local_customizations) return;
    const currentUser = JSON.parse(localStorage.getItem("current-user") || "{}");
    const shortId = currentUser?.shortId || "";
    if (!shortId) return;
    const local = buildLocalCustomization(shortId);
    if (local) customizationsMap.set(shortId, local);
  };

  const fetchCustomizations = async (): Promise<void> => {
    const customizations = await fetch("https://kirka.lukeskywalk.com/static/customizations.json").then((r) =>
      r.json()
    );

    localStorage.setItem(
      "juice-customizations",
      JSON.stringify(customizations)
    );
    updateCustomizationsMap(customizations);
    injectLocalCustomization();
    document.dispatchEvent(new CustomEvent("publikc-customizations-loaded"));
  };

  const fetchClans = async (): Promise<void> => {
    try {
      const clans = await fetch(
        "https://kirka.lukeskywalk.com/static/clans.json"
      ).then((r) => r.json());
      updateClansMap(clans);
    } catch {}
  };

  // Applies a clan's gradient to every matching `.clan-tag` currently on screen.
  const applyClanGradients = (): void => {
    if (!settings.clancustomizations || clansMap.size === 0) return;
    const tags = document.querySelectorAll(".clan-tag");
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i] as HTMLElement;
      const customs = clansMap.get((tag.textContent || "").trim());
      if (!customs || !customs.gradient || tag.dataset.juiceClan === "1") continue;
      tag.dataset.juiceClan = "1";
      tag.style.display = "inline-block";
      tag.style.background = `linear-gradient(${customs.gradient.rot}, ${customs.gradient.stops.join(", ")})`;
      tag.style.webkitBackgroundClip = "text";
      (tag.style as any).backgroundClip = "text";
      tag.style.webkitTextFillColor = "transparent";
      tag.style.fontWeight = "700";
      if (customs.gradient.shadow) tag.style.textShadow = customs.gradient.shadow;
      if (customs.animated) tag.classList.add("juice-animated-gradient");
    }
  };

  fetchCustomizations();
  fetchClans();

  document.addEventListener("publikc-local-customizations-changed", injectLocalCustomization);

  // Resolve the logged-in player's shortId so name customizations apply to you.
  //
  // Primary: the window.fetch sniffer (installed at preload load) captures the
  // player's user object from Kirka's own API traffic — rotation-proof, since it
  // keys off the stable `shortId` field rather than an obfuscated endpoint path.
  // Fallback: scrape the username from the DOM (works with no token / no network
  // and when Kirka uses XHR instead of fetch). Whichever resolves first wins;
  // both are torn down on resolution so no interval leaks.
  const resolveCurrentUser = (): void => {
    let domInterval: ReturnType<typeof setInterval> | null = null;
    const stopDom = (): void => {
      if (domInterval) {
        clearInterval(domInterval);
        domInterval = null;
      }
    };
    const onResolved = (): void => {
      injectLocalCustomization();
      stopDom();
    };

    document.addEventListener("publikc-current-user-resolved", onResolved, { once: true });

    // The sniffer may have captured the user before this ran (dispatching the
    // event with no listener attached yet) — re-announce so listeners catch up.
    if (currentUserFromNetwork) {
      document.dispatchEvent(new CustomEvent("publikc-current-user-resolved"));
      return;
    }

    domInterval = setInterval(() => {
      // `.username` reads "Name#shortId". Split on the LAST # for the shortId so
      // we also capture the display name (previously we only stored shortId,
      // which left the menu's user label showing "undefined#…"). Fall back to
      // `.nickname` for the name if `.username` carries only the id.
      const text = (document.querySelector(".username") as HTMLElement)?.textContent?.trim() || "";
      if (!text) return;
      const hash = text.lastIndexOf("#");
      const shortId = (hash >= 0 ? text.slice(hash + 1) : text).trim();
      if (!shortId) return;
      let name = hash > 0 ? text.slice(0, hash).trim() : "";
      if (!name) name = (document.querySelector(".nickname") as HTMLElement)?.textContent?.trim() || "";
      localStorage.setItem("current-user", JSON.stringify(name ? { name, shortId } : { shortId }));
      document.dispatchEvent(new CustomEvent("publikc-current-user-resolved"));
    }, 500);
    addCleanupTask(stopDom);
  };
  resolveCurrentUser();

  const formatLink = (link: string): string => link.replace(/\\/g, "/");

  const lobbyKeybindReminder = (settings: Settings): void => {
    const keybindReminder = document.createElement("span");
    keybindReminder.id = "juice-keybind-reminder";
    keybindReminder.style.cssText = `position: absolute; left: 147px; bottom: 10px; font-size: 0.9rem; color: #fff; width: max-content`;

    keybindReminder.innerText = `Press ${settings.menu_keybind} to open the client menu.`;

    if (
      !document.querySelector("#app > .interface") ||
      document.querySelector("#juice-keybind-reminder")
    )
      return;

    const leftIcons = document.querySelector("#app #left-icons");
    if (leftIcons) {
      leftIcons.appendChild(keybindReminder);
    }

    const settingsChangedHandler = (event: Event): void => {
      const customEvent = event as SettingsChangedEvent;
      if (customEvent.detail.setting === "menu_keybind") {
        const keybindReminder = document.querySelector(
          "#juice-keybind-reminder"
        );
        if (keybindReminder)
          keybindReminder.textContent = `Press ${customEvent.detail.value} to open the client menu.`;
      }
    };
    document.addEventListener("juice-settings-changed", settingsChangedHandler);
    addCleanupTask(() => document.removeEventListener("juice-settings-changed", settingsChangedHandler));
  };

  const lobbyNews = async (settings: Settings): Promise<void> => {
    if (
      !document.querySelector("#app > .interface") ||
      document.querySelector(".lobby-news")
    )
      return;

    const { general_news, promotional_news, event_news, alert_news } = settings;
    if (!general_news && !promotional_news && !event_news && !alert_news)
      return;

    let news: NewsItem[] = await fetch("https://kirka.lukeskywalk.com/static/news.json").then((r) =>
      r.json()
    );
    if (!news.length) return;

    const filteredNews: NewsItem[] = [];
    for (let i = 0; i < news.length; i++) {
      const { category } = news[i];
      const categories: Record<string, boolean> = {
        general: general_news,
        promotional: promotional_news,
        event: event_news,
        alert: alert_news,
      };
      if (categories[category]) {
        filteredNews.push(news[i]);
      }
    }
    news = filteredNews;

    const lobbyNewsContainer = document.createElement("div");
    lobbyNewsContainer.id = "lobby-news";
    lobbyNewsContainer.className = "lobby-news";
    lobbyNewsContainer.style.cssText = `
      width: 250px;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-left: 148px;
      margin-top: 0.5rem;
      pointer-events: auto;
    `;
    const leftInterface = document.querySelector("#app #left-interface");
    if (leftInterface) {
      leftInterface.appendChild(lobbyNewsContainer);
    }

    const createNewsCard = (newsItem: NewsItem): void => {
      const div = document.createElement("div");
      div.className = "news-card";
      div.style.cssText = `
        width: 100%;
        border: 4px solid #3e4d7c;
        border-bottom: solid 4px #26335b;
        border-top: 4px solid #4d5c8b;
        background-color: #3b4975;
        display: flex;
        position: relative;
        ${newsItem.link ? "cursor: pointer;" : ""}
        ${newsItem.imgType === "banner" ? "flex-direction: column;" : ""}
      `;
      lobbyNewsContainer.appendChild(div);

      const addImage = (): void => {
        const img = document.createElement("img");
        img.className = `news-img ${newsItem.imgType}`;
        img.src = newsItem.img;
        img.style.cssText = `
          width: ${newsItem.imgType === "banner" ? "100%" : "4rem"};
          max-height: ${newsItem.imgType === "banner" ? "7.5rem" : "4rem"};
          object-fit: cover;
          object-position: center;
        `;
        div.appendChild(img);
      };

      const addBadge = (text: string, color: string): void => {
        const badgeSpan = document.createElement("span");
        badgeSpan.className = "badge";
        badgeSpan.innerText = text;
        badgeSpan.style.cssText = `
          position: absolute;
          top: 0;
          right: 0;
          background-color: ${color};
          color: #fff;
          padding: 0.15rem 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 0 0 0 0.25rem;
        `;
        div.appendChild(badgeSpan);
      };

      const addContent = (): void => {
        const content = document.createElement("div");
        content.className = "news-container";
        content.style.cssText = `
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          text-align: left;
        `;

        const title = document.createElement("span");
        title.className = "news-title";
        title.innerText = newsItem.title;
        title.style.cssText = `
          font-size: 1.2rem;
          font-weight: 600;
          color: #fff;
          margin: 0;
          color: #ffb914;
        `;
        content.appendChild(title);

        const text = document.createElement("span");
        text.className = "news-content";
        text.innerText = newsItem.content;
        text.style.cssText = `
          font-size: 0.9rem;
          color: #fff;
          margin: 0;
        `;

        if (newsItem.content) content.appendChild(text);
        div.appendChild(content);
      };

      if (newsItem.img && newsItem.img !== "") addImage();
      if (
        newsItem.updatedAt &&
        newsItem.updatedAt > Date.now() - 432000000 &&
        !newsItem.live
      )
        addBadge("NEW", "#e24f4f");
      else if (newsItem.live) addBadge("LIVE", "#4dbf4d");
      addContent();

      div.onclick = () => {
        if (newsItem.link) {
          if (newsItem.link.startsWith("https://kirka.io/"))
            window.location.href = newsItem.link;
          else
            window.open(
              newsItem.link.replace("https://kirka.io/", base_url),
              "_blank"
            );
        }
      };
    };

    for (let i = 0; i < news.length; i++) {
      createNewsCard(news[i]);
    }
  };

  const juiceDiscordButton = (): void => {
    const btns = document.querySelectorAll(".card-cont.soc-group");
    const btn = btns[1] as HTMLElement;
    if (!btn || document.querySelector("#juice-discord-btn")) return;

    const discordBtn = btn.cloneNode(true) as HTMLElement;
    discordBtn.className =
      "card-cont soc-group transfer-list-top-enter transfer-list-top-enter-active";
    discordBtn.id = "juice-discord-btn";
    discordBtn.style.cssText = `
    background:linear-gradient(to top,rgba(230,73,0,.75),rgba(97,6,2,.75)) !important;
    border-bottom-color:#4d0401 !important;
    border-top-color:#ff6a2e !important;
    border-right-color:#b43812 !important;`;
    const textSoc = discordBtn.querySelector(".text-soc");
    if (textSoc) {
      const textDivs = textSoc.children;
      if (textDivs[0]) textDivs[0].textContent = "PUBLIKC";
      if (textDivs[1]) textDivs[1].textContent = "DISCORD";
    }

    const i = document.createElement("i");
    i.className = "fab fa-discord";
    i.style.fontSize = "48px";
    i.style.fontFamily = "Font Awesome 6 Brands";
    i.style.margin = "3.2px 1.6px 0 1.6px";
    i.style.textShadow = "0 0 0 transparent";
    const svg = discordBtn.querySelector("svg");
    if (svg) {
      svg.replaceWith(i);
    }

    discordBtn.onclick = () => {
      window.open("https://discord.gg/jPgezmpNwm", "_blank");
    };

    btn.replaceWith(discordBtn);

    let allowTransition = true;

    const observer = new MutationObserver(() => {
      if (allowTransition) return;

      if (discordBtn && discordBtn.className !== "card-cont soc-group") {
        discordBtn.className = "card-cont soc-group";
      }
    });

    observer.observe(discordBtn, { attributes: true, attributeFilter: ["class"] });
    addCleanupTask(() => observer.disconnect());

    setTimeout(() => {
      allowTransition = false;
      discordBtn.className = "card-cont soc-group";
    }, 1000);
  };

  const loadTheme = (): void => {
    const addedStyles = document.createElement("style");
    addedStyles.id = "juice-styles-theme";
    document.head.appendChild(addedStyles);

    const customStyles = document.createElement("style");
    customStyles.id = "juice-styles-custom";
    document.head.appendChild(customStyles);

    const updateTheme = (): void => {
      const cssLink = settings.css_link;
      const advancedCSS = settings.advanced_css;

      if (cssLink && settings.css_enabled) {
        addedStyles.innerHTML = `@import url('${formatLink(cssLink)}');`;
      } else {
        addedStyles.innerHTML = "";
      }

      customStyles.innerHTML = advancedCSS;
    };

    const themeChangedHandler = (e: Event): void => {
      const customEvent = e as SettingsChangedEvent;
      if (
        customEvent.detail.setting === "css_link" ||
        customEvent.detail.setting === "css_enabled" ||
        customEvent.detail.setting === "advanced_css"
      ) {
        updateTheme();
      }
    };
    document.addEventListener("juice-settings-changed", themeChangedHandler);
    addCleanupTask(() => document.removeEventListener("juice-settings-changed", themeChangedHandler));

    updateTheme();
  };

  const applyUIFeatures = (): void => {
    const addedStyles = document.createElement("style");
    addedStyles.id = "juice-styles-ui-features";
    document.head.appendChild(addedStyles);

    const updateUIFeatures = (): void => {
      const styles: string[] = [
        "@keyframes animated-gradient { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }",
        ".juice-animated-gradient { background-size: 200% 200% !important; animation: animated-gradient 3s linear infinite !important; }",
      ];

      if (settings.perm_crosshair)
        styles.push(
          ".crosshair-static { opacity: 1 !important; visibility: visible !important; display: block !important; }"
        );
      if (settings.hide_chat)
        styles.push(
          ".desktop-game-interface > #bottom-left > .chat { display: none !important; }"
        );
      if (settings.hide_interface)
        styles.push(
          ".desktop-game-interface, .crosshair-cont, .ach-cont, .hitme-cont, .sniper-mwNMW-cont, .team-score, .score { display: none !important; }"
        );
      if (settings.skip_loading)
        styles.push(".loading-scene { display: none !important; }");
      if (settings.perm_tablist) styles.push(permanentScoreboardCSS);
      if (settings.hide_kill_text)
        styles.push(".ach-cont .text { display: none !important; }");
      if (!settings.spectate_button)
        styles.push(".spectate-eye { display: none !important; }");
      if (settings.colored_killfeed) {
        styles.push(
          ".desktop-game-interface .kill-bar-cont .kill-bar-item.red { background: rgba(255, 77, 66, 0.5) !important; }",
          ".desktop-game-interface .kill-bar-cont .kill-bar-item.blue { background: rgba(13, 109, 198, 0.8) !important; }"
        );
      }
      if (settings.chat_height && settings.chat_height !== "0") {
        const extra = settings.chat_height;
        styles.push(
          `.desktop-game-interface #chat { bottom: calc(4.7em + ${extra}em * 1.2) !important; }` +
          `.desktop-game-interface #chat .messages { min-height: calc(11.75em + ${extra}em) !important; }`
        );
      }
      if (settings.interface_opacity)
        styles.push(
          `.desktop-game-interface { opacity: ${settings.interface_opacity}% !important; }`
        );
      if (settings.interface_bounds) {
        let scale =
          settings.interface_bounds === "1"
            ? 0.9
            : settings.interface_bounds === "0"
              ? 0.8
              : 1;
        styles.push(
          `.desktop-game-interface { transform: scale(${scale}) !important; }`
        );
      }
      if (settings.hitmarker_link !== "")
        styles.push(
          `.hitmark { content: url(${formatLink(
            settings.hitmarker_link
          )}) !important; }`
        );
      if (settings.killicon_link !== "")
        styles.push(`.animate-cont::before { content: "";
      background: url(${formatLink(
          settings.killicon_link
        )}); width: 10rem; height: 10rem; margin-bottom: 2rem; display: inline-block; background-position: center; background-size: contain; background-repeat: no-repeat; }
      .animate-cont svg { display: none; }`);
      if (!settings.ui_animations)
        styles.push(
          "* { transition: none !important; animation: none !important; }"
        );
      if (settings.rave_mode)
        styles.push(
          "canvas { animation: rotateHue 1s linear infinite !important; }"
        );
      if (!settings.lobby_keybind_reminder)
        styles.push("#juice-keybind-reminder { display: none; }");

      addedStyles.innerHTML = styles.join("");
    };

    const uiFeaturesChangedHandler = (e: Event): void => {
      const customEvent = e as SettingsChangedEvent;
      const relevantSettings = [
        "perm_crosshair",
        "hide_chat",
        "hide_interface",
        "skip_loading",
        "perm_tablist",
        "hide_kill_text",
        "spectate_button",
        "colored_killfeed",
        "chat_height",
        "interface_opacity",
        "interface_bounds",
        "hitmarker_link",
        "killicon_link",
        "ui_animations",
        "rave_mode",
        "lobby_keybind_reminder",
      ];
      if (relevantSettings.includes(customEvent.detail.setting)) updateUIFeatures();
    };
    document.addEventListener("juice-settings-changed", uiFeaturesChangedHandler);
    addCleanupTask(() => document.removeEventListener("juice-settings-changed", uiFeaturesChangedHandler));

    updateUIFeatures();
  };

  // Optional on-screen text watermark. It lives on <body> so it survives the
  // game's in-page navigation, and reacts to live setting changes.
  const applyWatermark = (): void => {
    const id = "publikc-watermark";

    const render = (): void => {
      const existing = document.getElementById(id);
      if (!settings.watermark_enabled) {
        existing?.remove();
        return;
      }

      const mark = existing || document.createElement("div");
      if (!existing) {
        mark.id = id;
        mark.style.cssText =
          "position: fixed; right: 0.75rem; bottom: 0.5rem; z-index: 1000; pointer-events: none; font-weight: 700; font-family: 'Exo 2', sans-serif; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);";
        document.body.appendChild(mark);
      }

      mark.textContent = settings.watermark_text || "publikc";
      mark.style.color = settings.watermark_color || "#ffffff";
      mark.style.fontSize = `${settings.watermark_size || "1.5"}rem`;
    };

    render();

    document.addEventListener("juice-settings-changed", (e: Event) => {
      const setting = (e as SettingsChangedEvent).detail.setting;
      if (
        setting === "watermark_enabled" ||
        setting === "watermark_text" ||
        setting === "watermark_color" ||
        setting === "watermark_size"
      )
        render();
    });
  };

  // Loads a publikc-hosted stylesheet that keeps the in-game settings button
  // reachable during matches. Toggled live; the CSS itself is hosted remotely.
  const applyAlwaysShowMenu = (): void => {
    const id = "publikc-always-show-menu";

    const render = (): void => {
      const existing = document.getElementById(id);
      if (settings.always_show_ingame_menu) {
        if (existing) return;
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = "https://kirka.lukeskywalk.com/static/aosb.css";
        document.head.appendChild(link);
      } else {
        existing?.remove();
      }
    };

    render();

    document.addEventListener("juice-settings-changed", (e: Event) => {
      if ((e as SettingsChangedEvent).detail.setting === "always_show_ingame_menu")
        render();
    });
  };

  const handleLobby = (): void => {
    lobbyKeybindReminder(settings);
    applyClanGradients();
    lobbyNews(settings);
    juiceDiscordButton();

    const applyCustomizations = (): boolean => {
      const currentUser = JSON.parse(localStorage.getItem("current-user") || "{}");
      const shortId = currentUser?.shortId || "";
      if (!shortId) return false;

      const customs = customizationsMap.get(shortId);
      if (!customs) return false;

      const lobbyNickname = document.querySelector(".nickname") as HTMLElement;
      if (!lobbyNickname) return false;

      if (customs.gradient)
        lobbyNickname.style.cssText = `
            display: flex; align-items: flex-end; gap: 0.25rem; overflow: unset !important;
            background: linear-gradient(${customs.gradient.rot
          }, ${customs.gradient.stops.join(", ")});
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent;
            text-shadow: ${customs.gradient.shadow || "0 0 0 transparent"
          } !important;
        `;
      else
        lobbyNickname.style.cssText =
          "display: flex; align-items: flex-end; gap: 0.25rem; overflow: unset !important;";

      lobbyNickname.classList.toggle(
        "juice-animated-gradient",
        !!(customs.gradient && customs.animated)
      );

      if (lobbyNickname.querySelector(".juice-badges")) return true;

      const badgesElem = document.createElement("div");
      badgesElem.style.cssText =
        "display: flex; gap: 0.25rem; align-items: center; width: 0;";
      badgesElem.className = "juice-badges";

      lobbyNickname.appendChild(badgesElem);

      let badgeStyle = "height: 32px; width: auto;";

      if (customs.discord) {
        const linkedBadge = document.createElement("img");
        linkedBadge.src = "https://kirka.lukeskywalk.com/static/linked.png";
        linkedBadge.style.cssText = badgeStyle;
        badgesElem.appendChild(linkedBadge);
      }

      if (customs.booster) {
        const boosterBadge = document.createElement("img");
        boosterBadge.src = "https://kirka.lukeskywalk.com/static/booster.png";
        boosterBadge.style.cssText = badgeStyle;
        badgesElem.appendChild(boosterBadge);
      }

      if (customs.badges && customs.badges.length) {
        for (let i = 0; i < customs.badges.length; i++) {
          const badge = customs.badges[i];
          const img = document.createElement("img");
          img.src = badge;
          img.style.cssText = badgeStyle;
          badgesElem.appendChild(img);
        }
      }

      return true;
    };

    const removeCustomizations = (): void => {
      const lobbyNickname = document.querySelector(".nickname") as HTMLElement;
      if (!lobbyNickname) return;
      lobbyNickname.style.cssText =
        "display: flex; align-items: flex-end; gap: 0.25rem;";
      lobbyNickname.querySelector(".juice-badges")?.remove();
    };

    if (settings.customizations) {
      const retryInterval = setInterval(() => {
        if (customizationsMap.size > 0 && applyCustomizations()) {
          clearInterval(retryInterval);
        }
      }, 500);
      addCleanupTask(() => clearInterval(retryInterval));
    }

    const customizationsChangedHandler = (event: Event): void => {
      const customEvent = event as SettingsChangedEvent;
      if (customEvent.detail.setting === "customizations")
        customEvent.detail.value ? applyCustomizations() : removeCustomizations();
    };
    document.addEventListener("juice-settings-changed", customizationsChangedHandler);
    addCleanupTask(() => document.removeEventListener("juice-settings-changed", customizationsChangedHandler));

    // ── Trade Buttons & Accept on Click ──────────────────────────────────
    let selectedTradeId: string | null = null;

    const highlightTrade = (): void => {
      if (!selectedTradeId) return;
      const trades = document.querySelectorAll(".servers .trade");
      for (let i = 0; i < trades.length; i++) {
        const trade = trades[i] as HTMLElement;
        const match = trade.textContent?.match(/\/trade accept (\d+)/);
        if (match && match[1] === selectedTradeId)
          trade.style.outline = "2px solid #fbbf24";
        else
          trade.style.outline = "";
      }
    };

    const buildTradeBar = (): void => {
      const servers = document.querySelector(".servers") as HTMLElement;
      if (!servers) return;
      if (servers.querySelector(".trade-bar")) return;

      const chat = servers.querySelector(".chat") as HTMLElement;
      if (!chat) return;

      const bar = document.createElement("div");
      bar.className = "trade-bar";
      bar.style.cssText = "display: flex; gap: 0.5rem; margin: 0.25rem 0 0.5rem 1rem;";

      const input = servers.querySelector(".chat .input") as HTMLInputElement;
      const sendBtn = servers.querySelector(".chat .enter") as HTMLElement;

      const doSend = (text: string): void => {
        if (!input || !sendBtn) return;
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        sendBtn.click();
      };

      const offer = document.createElement("div");
      offer.textContent = "OFFER";
      offer.style.cssText = "cursor:pointer;user-select:none;padding:0.2rem 1rem;font-size:.85rem;font-weight:700;text-align:center;color:#fff;border-radius:3px;background:#3b82f6;transition:background .15s;";
      offer.addEventListener("mouseenter", () => { offer.style.background = "#2563eb"; });
      offer.addEventListener("mouseleave", () => { offer.style.background = "#3b82f6"; });
      offer.addEventListener("click", () => {
        if (!input) return;
        input.value = "/trade offer my:[] your:[]";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const bump = document.createElement("div");
      bump.textContent = "BUMP";
      bump.style.cssText = "cursor:pointer;user-select:none;padding:0.2rem 1rem;font-size:.85rem;font-weight:700;text-align:center;color:#fff;border-radius:3px;background:#10b981;transition:background .15s;";
      bump.addEventListener("mouseenter", () => { bump.style.background = "#059669"; });
      bump.addEventListener("mouseleave", () => { bump.style.background = "#10b981"; });
      bump.addEventListener("click", () => doSend("/trade bump"));

      const cancel = document.createElement("div");
      cancel.textContent = "CANCEL";
      cancel.style.cssText = "cursor:pointer;user-select:none;padding:0.2rem 1rem;font-size:.85rem;font-weight:700;text-align:center;color:#fff;border-radius:3px;background:#ef4444;transition:background .15s;";
      cancel.addEventListener("mouseenter", () => { cancel.style.background = "#dc2626"; });
      cancel.addEventListener("mouseleave", () => { cancel.style.background = "#ef4444"; });
      cancel.addEventListener("click", () => doSend("/trade cancel"));

      bar.appendChild(offer);
      bar.appendChild(bump);
      bar.appendChild(cancel);
      chat.insertAdjacentElement("afterbegin", bar);
    };

    const tradeClick = (e: Event): void => {
      if (!settings.accept_on_click) return;
      const target = e.target as HTMLElement;
      const tradeElem = target.closest(".servers .trade") as HTMLElement;
      if (!tradeElem || target.closest(".trade .button")) return;
      const boldEl = tradeElem.querySelector(".bold") as HTMLElement;
      if (!boldEl) return;
      const match = boldEl.textContent?.match(/\/trade accept (\d+)/);
      if (!match) return;

      selectedTradeId = match[1];
      highlightTrade();

      const input = document.querySelector(".servers .chat .input") as HTMLInputElement;
      const sendBtn = document.querySelector(".servers .chat .enter") as HTMLElement;
      if (!input || !sendBtn) return;

      input.value = `/trade accept ${selectedTradeId}`;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      sendBtn.click();

      setTimeout(() => {
        input.value = "/trade confirm";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        sendBtn.click();
      }, 120);
    };

    let tradeBarAttempts = 0;
    const tryBuildBar = (): void => {
      if (document.querySelector(".servers .trade-bar")) return;
      buildTradeBar();
      if (++tradeBarAttempts > 40) return;
      setTimeout(tryBuildBar, 500);
    };
    if (settings.show_trade_buttons) tryBuildBar();

    if (settings.accept_on_click) {
      document.addEventListener("click", tradeClick);
      addCleanupTask(() => document.removeEventListener("click", tradeClick));
    }

    const tradeSettingChanged = (e: Event): void => {
      const ev = e as SettingsChangedEvent;
      if (ev.detail.setting === "show_trade_buttons") {
        const bar = document.querySelector(".servers .trade-bar");
        if (ev.detail.value && !bar) buildTradeBar();
        else if (!ev.detail.value) bar?.remove();
      }
    };
    document.addEventListener("juice-settings-changed", tradeSettingChanged);
    addCleanupTask(() => document.removeEventListener("juice-settings-changed", tradeSettingChanged));

    const bodyObserver = new MutationObserver(() => {
      if (settings.accept_on_click) highlightTrade();
      if (settings.show_trade_buttons) buildTradeBar();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    addCleanupTask(() => bodyObserver.disconnect());
  };

  const handleServers = async (): Promise<void> => {
    const MAP_BASE = "https://raw.githubusercontent.com/AwesomeSam9523/KirkaSkins/refs/heads/main";
    let mapImages: MapImages = {};
    try {
      const res = await fetch(`${MAP_BASE}/maps/full_mapimages.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      mapImages = await res.json();
    } catch {
      return;
    }

    const mapImageKeys = Object.keys(mapImages);
    for (let i = 0; i < mapImageKeys.length; i++) {
      const item = mapImageKeys[i];
      if (!mapImages[item].includes("https")) {
        mapImages[item] = MAP_BASE + mapImages[item];
      }
    }

    const processedServers = new Set<Element>();

    const replaceMapImages = (): void => {
      const servers = document.querySelectorAll(".server");
      for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        if (processedServers.has(server)) continue;

        const serverEl = server as HTMLElement;
        const mapEl = server.querySelector(".map");
        if (!mapEl) continue;
        let mapName = mapEl.textContent?.split("_").pop() || "";
        if (mapImages[mapName]) {
          serverEl.style.backgroundImage = `url(${mapImages[mapName]})`;
          serverEl.style.backgroundSize = "cover";
          serverEl.style.backgroundPosition = "center";
        } else serverEl.style.backgroundImage = "none";

        processedServers.add(server);
      }
    };

    replaceMapImages();

    const observer = new MutationObserver(() => {
      if (!window.location.href.startsWith(base_url + "servers/")) {
        observer.disconnect();
        return;
      }
      replaceMapImages();
    });

    const serverList = document.querySelector(".servers-list") || document.body;
    observer.observe(serverList, { childList: true, subtree: true });
    addCleanupTask(() => observer.disconnect());

    const clickHandler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (e.shiftKey && target.classList.contains("author-name"))
        setTimeout(() => {
          navigator.clipboard.readText().then((text) => {
            window.location.href = `${base_url}profile/${text.replace(
              "#",
              ""
            )}`;
            const username = target.textContent?.replace(":", "") || "";
            customNotification({
              message: `Loading ${username}${text}'s profile...`,
            });
          });
        }, 250);
    };
    document.addEventListener("click", clickHandler);
    addCleanupTask(() => document.removeEventListener("click", clickHandler));
  };

  const handleProfile = (): void => {
    // Opens the local-nickname editor modal for a profile.
    const openNicknameModal = (shortId: string, profileEl: HTMLElement): void => {
      const existing = readNicknames()[shortId];
      const rawName = profileEl.querySelector(".card-profile .copy-cont > .value")?.textContent?.trim() || "";
      const originalName = existing?.original || rawName.split("#")[0].trim();

      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;";

      const modal = document.createElement("div");
      modal.style.cssText =
        "background:#202639;border:1px solid rgba(255,255,255,0.15);border-radius:0.5rem;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;min-width:18rem;font-family:'Exo 2',sans-serif;color:#fff;";
      modal.innerHTML = `<span style="font-size:1.2rem;font-weight:700;">Change Nickname</span>`;

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 20;
      input.placeholder = originalName;
      input.value = existing?.nickname || "";
      input.style.cssText =
        "padding:0.6rem;border-radius:0.35rem;border:1px solid rgba(255,255,255,0.2);background:#2f3957;color:#fff;outline:none;";

      const apply = document.createElement("button");
      apply.textContent = "Apply (reloads)";
      apply.style.cssText =
        "padding:0.6rem;border:none;border-radius:0.35rem;background:#ffb914;color:#202639;font-weight:700;cursor:pointer;";
      apply.addEventListener("click", () => {
        const map = readNicknames();
        const value = input.value.trim();
        if (value) map[shortId] = { original: originalName, nickname: value };
        else delete map[shortId];
        localStorage.setItem("nicknames", JSON.stringify(map));
        window.location.reload();
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      modal.appendChild(input);
      modal.appendChild(apply);
      overlay.appendChild(modal);
      (document.querySelector("#app") || document.body).appendChild(overlay);
      input.focus();
    };

    const addNicknameEditor = (profileEl: HTMLElement, shortId: string): void => {
      if (!shortId || profileEl.querySelector(".juice-edit-nickname")) return;
      profileEl.style.position = "relative";
      const btn = document.createElement("div");
      btn.className = "juice-edit-nickname";
      btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Nickname';
      btn.style.cssText =
        "position:absolute;bottom:1rem;right:1rem;display:inline-flex;align-items:center;gap:0.4rem;padding:0.4rem 0.8rem;background:rgba(20,20,20,0.6);border-radius:0.35rem;color:#fff;font-size:0.9rem;cursor:pointer;z-index:5;";
      btn.addEventListener("click", () => openNicknameModal(shortId, profileEl));
      profileEl.appendChild(btn);
    };

    // Profile K/D + headshot-% injection. Self-contained and anchored directly
    // on the `.statistics` card, so it works regardless of the rest of the
    // profile processor (which is gated on `.profile > .content`, a selector
    // that doesn't match every profile layout). Gated by the K/D Indicator
    // setting; computes from the kills/deaths/headshots rows (by name, with a
    // positional fallback: 1 games, 3 kills, 4 deaths, 5 headshots).
    const injectProfileStats = (): void => {
      const container = document.querySelector(".statistics");

      if (!settings.kd_indicator) {
        container?.querySelectorAll(".statistic[data-publikc]").forEach((el) => el.remove());
        return;
      }
      if (!container) return;

      // Headshot-% is shown as its own row here, so drop any inline suffix.
      container.querySelectorAll(".headshotpercentage").forEach((el) => el.remove());

      const origStats = Array.from(
        container.querySelectorAll(".statistic:not([data-publikc])")
      ) as HTMLElement[];

      const removeInjected = (key?: string): void => {
        const sel = key ? `.statistic[data-publikc="${key}"]` : ".statistic[data-publikc]";
        container.querySelectorAll(sel).forEach((el) => el.remove());
      };

      const readNum = (row: HTMLElement | undefined): number | null => {
        if (!row) return null;
        const raw = row.querySelector(".stat-value")?.textContent?.split(" ")[0] || "";
        const num = parseFloat(raw.replace(/,/g, ""));
        return Number.isFinite(num) ? num : null;
      };
      const find = (name: string, pos: number): { row: HTMLElement; num: number } | null => {
        let row = origStats.find(
          (s) => s.querySelector(".stat-name")?.textContent?.trim().toLowerCase() === name
        );
        if (!row) row = origStats[pos - 1];
        const num = readNum(row);
        return row && num !== null ? { row, num } : null;
      };

      const kills = find("kills", 3);
      const deaths = find("deaths", 4);
      const headshots = find("headshots", 5);

      // Some stat tabs (e.g. trophies) have no kills/deaths — drop our rows
      // rather than leaving stale values from the previous tab.
      if (!kills || !deaths) {
        removeInjected();
        return;
      }
      const template = deaths.row;

      const upsert = (key: string, label: string, value: string, after: HTMLElement): void => {
        let row = container.querySelector(`.statistic[data-publikc="${key}"]`) as HTMLElement | null;
        if (!row) {
          row = template.cloneNode(true) as HTMLElement;
          row.setAttribute("data-publikc", key);
          after.after(row);
        }
        const nameNode = row.querySelector(".stat-name");
        const valueNode = row.querySelector(".stat-value");
        // Only write when changed, so re-injecting from the stats observer
        // doesn't mutate the DOM (and re-trigger itself) once settled.
        if (nameNode && nameNode.textContent !== label) nameNode.textContent = label;
        if (valueNode && valueNode.textContent !== value) valueNode.textContent = value;
      };

      upsert("kd", "k/d", (kills.num / (deaths.num || 1)).toFixed(2), deaths.row);

      if (headshots && kills.num > 0)
        upsert("hs", "headshot %", `${((headshots.num / kills.num) * 100).toFixed(1)}%`, headshots.row);
      else
        removeInjected("hs");
    };

    const processProfile = (): void => {
      if (!window.location.href.startsWith(base_url + "profile/")) {
        return;
      }

      injectProfileStats();

      if (document.querySelector(".profile > .content")) {

        const profile = document.querySelector(
          ".content > .profile-cont > .profile"
        ) as HTMLElement;
        const content = profile?.querySelector(".profile > .content") as HTMLElement;
        const statistics = document.querySelectorAll(".statistic");
        const progressExp = document.querySelector(".progress-exp") as HTMLElement;

        if (!profile || !content) return;

        profile.style.cssText = "width: unset; min-width: 60rem;";
        applyClanGradients();
        const youEl = profile.querySelector(".you") as HTMLElement;
        if (youEl) youEl.style.cssText = "width: 100%;";
        content.style.cssText = "width: 36.5rem; flex-shrink: 0;";

        if (progressExp) {
          const [current, max] = progressExp.textContent?.split("/") || ["0", "0"];
          progressExp.textContent = `${parseInt(
            current
          ).toLocaleString()}/${parseInt(max).toLocaleString()}`;
        }

        let kills: string = "";
        let deaths: string = "";

        const statRefs: Record<string, { el: Element; num: number }> = {};

        for (let i = 0; i < statistics.length; i++) {
          const stat = statistics[i];
          const nameEl = stat.querySelector(".stat-name");
          const valueEl = stat.querySelector(".stat-value");
          if (!nameEl || !valueEl) continue;
          const name = nameEl.textContent || "";
          const value = valueEl.textContent || "";

          if (name === "kills") kills = value;
          if (name === "deaths") deaths = value;

          const numeric = parseFloat((value.split(" ")[0] || "").replace(/,/g, ""));
          if (Number.isFinite(numeric)) statRefs[name] = { el: valueEl, num: numeric };

          if (stat.textContent?.includes(".")) continue;

          valueEl.textContent = value.replace(
            value.split(" ")[0],
            parseInt(value.split(" ")[0]).toLocaleString()
          );
        }

        // Derive win rate (wins / games) and headshot % (headshots / kills) and
        // append them inline next to the matching stat, once each.
        const appendRate = (ref: { el: Element; num: number } | undefined, rate: number, cls: string): void => {
          if (!ref || !Number.isFinite(rate) || ref.el.querySelector(`.${cls}`)) return;
          if (ref.el.textContent?.includes("%")) return;
          const span = document.createElement("span");
          span.className = cls;
          span.textContent = ` ${rate.toFixed(1)}%`;
          span.style.cssText = "color: rgba(255, 255, 255, 0.5); font-size: 0.85em;";
          ref.el.appendChild(span);
        };

        const gamesNum = (statRefs["games"] ?? statRefs["played"])?.num;
        const winsRef = statRefs["wins"] ?? statRefs["win"] ?? statRefs["won"];
        const killsNum = statRefs["kills"]?.num;
        const headshotsRef = statRefs["headshots"];

        if (winsRef && gamesNum && gamesNum > 0)
          appendRate(winsRef, (winsRef.num / gamesNum) * 100, "winrate");
        // When the K/D Indicator is on, headshot-% becomes a proper injected row
        // (below) instead of an inline suffix, so don't add it inline too.
        if (!settings.kd_indicator && headshotsRef && killsNum && killsNum > 0)
          appendRate(headshotsRef, (headshotsRef.num / killsNum) * 100, "headshotpercentage");

        const cards = content.querySelectorAll(".top-medium > .top > .card");
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          if (card.classList.contains("progress")) continue;
          const cardEl = card as HTMLElement;
          cardEl.style.width = "unset";
          if (card.classList.contains("k-d")) {
            const kdEl = card.querySelector(".stat-value-kd");
            if (kdEl) {
              kdEl.textContent = (
                parseFloat(kills) / parseFloat(deaths)
              ).toFixed(2);
            }
          }
        }

        const copyCont = content.querySelector(".card-profile .copy-cont > .value");
        const shortId = copyCont?.textContent?.replace("#", "") || "";

        // Local nickname: show the override on the profile name and offer the
        // editor button.
        const profileNick = shortId ? readNicknames()[shortId]?.nickname : "";
        if (profileNick)
          setNameTextNode(
            (profile.querySelector(".nickname-span") || profile.querySelector(".nickname")) as HTMLElement,
            profileNick
          );
        addNicknameEditor(profile, shortId);

        if (settings.customizations) {
          const nickname = profile.querySelector(".nickname") as HTMLElement;
          if (!nickname) return;
          nickname.style.cssText +=
            "display: flex; align-items: flex-end; gap: 0.25rem; overflow: unset !important;";

          const textNode = nickname.firstChild;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const span = document.createElement("span");
            span.className = "nickname-span";
            span.textContent = textNode.textContent;
            nickname.replaceChild(span, textNode);
          }

          const badgesElem = document.createElement("div");
          badgesElem.style.cssText =
            "display: flex; gap: 0.25rem; align-items: center;";
          badgesElem.className = "juice-badges";
          nickname.appendChild(badgesElem);

          const customs = customizationsMap.get(shortId);
          if (customs) {

            let badgeStyle = "height: 32px; width: auto;";

            if (customs.gradient) {
              const nicknameSpan = nickname.querySelector(".nickname-span") as HTMLElement;
              if (nicknameSpan) {
                nicknameSpan.style.cssText += `
              background: linear-gradient(${customs.gradient.rot
                }, ${customs.gradient.stops.join(", ")});
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              text-shadow: ${customs.gradient.shadow || "0 0 0 transparent"
                } !important;
            `;
                nicknameSpan.classList.toggle("juice-animated-gradient", !!customs.animated);
              }
            }

            if (customs.discord) {
              const linkedBadge = document.createElement("img");
              linkedBadge.src = "https://kirka.lukeskywalk.com/static/linked.png";
              linkedBadge.style.cssText = badgeStyle;
              badgesElem.appendChild(linkedBadge);
            }

            if (customs.booster) {
              const boosterBadge = document.createElement("img");
              boosterBadge.src = "https://kirka.lukeskywalk.com/static/booster.png";
              boosterBadge.style.cssText = badgeStyle;
              badgesElem.appendChild(boosterBadge);
            }

            if (customs.badges && customs.badges.length) {
              for (let i = 0; i < customs.badges.length; i++) {
                const badge = customs.badges[i];
                const img = document.createElement("img");
                img.src = badge;
                img.style.cssText = badgeStyle;
                badgesElem.appendChild(img);
              }
            }
          }
        }

        if (shortId && shortId === "H8N3U4") {
          const profile = document.querySelector(".profile-cont > .profile") as HTMLElement;
          if (!profile) return;
          profile.style.position = "relative";

          const div = document.createElement("div");
          div.style.cssText = `
            position: absolute;
            bottom: 1rem;
            left: 1rem;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
          `;
          div.innerHTML = `
          <img src="https://kirka.lukeskywalk.com/static/bubbles.png" style="height: 0.8rem; width: auto;" />
          <span style="font-size: 1rem; font-weight: 600; color: #fff;">Juice Client Developer</span>
          `;
          profile.appendChild(div);
        }
      }
    };

    const observer = new MutationObserver(() => {
      processProfile();
      if (document.querySelector(".profile > .content")) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    addCleanupTask(() => observer.disconnect());

    // The heavy processProfile observer above disconnects once the profile is
    // built, but the stat tabs (main stats / DM / TDM / …) re-render the
    // .statistics card afterwards. Keep a lightweight, debounced observer alive
    // for the page lifetime to re-inject K/D + headshot-% on those switches.
    // injectProfileStats is idempotent (only writes on change), so this can't
    // loop on its own mutations.
    let injectScheduled = false;
    const statsObserver = new MutationObserver(() => {
      if (injectScheduled) return;
      injectScheduled = true;
      requestAnimationFrame(() => {
        injectScheduled = false;
        injectProfileStats();
      });
    });
    statsObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    addCleanupTask(() => statsObserver.disconnect());

    processProfile();
  };

  const handleInGame = (): void => {
    const nicknames = readNicknames();

    // ── Colored killfeed ────────────────────────────────────────────────
    let redRoster = new Set<string>();
    let blueRoster = new Set<string>();

    const collectTeam = (selector: string, into: Set<string>): void => {
      const players = document.querySelectorAll(selector);
      for (let i = 0; i < players.length; i++) {
        const shortId = players[i].querySelector(".short-id")?.textContent?.replace("#", "").trim() || "";
        // Match the killfeed (which shows real names), so use the original name
        // for any player that has a local nickname applied.
        const original = shortId ? nicknames[shortId]?.original : "";
        const name = original || players[i].querySelector(".nickname")?.textContent?.trim();
        if (name) into.add(name);
      }
    };

    // Swaps in local nicknames on the in-game scoreboard without disturbing
    // badges; re-applied each frame by the interface observer.
    const applyTabNicknames = (): void => {
      const players = document.querySelectorAll(".desktop-game-interface .player-cont");
      for (let i = 0; i < players.length; i++) {
        const shortId = players[i].querySelector(".short-id")?.textContent?.replace("#", "").trim() || "";
        const nick = shortId ? nicknames[shortId]?.nickname : "";
        if (nick) setNameTextNode(players[i].querySelector(".nickname") as HTMLElement, nick);
      }
    };

    const updateRosters = (): void => {
      redRoster = new Set();
      blueRoster = new Set();
      collectTeam(".desktop-game-interface .player-left-cont .player-cont", redRoster);
      collectTeam(".desktop-game-interface .player-right-cont .player-cont", blueRoster);
    };

    const updateKillFeed = (): void => {
      const items = document.querySelectorAll(
        ".desktop-game-interface .kill-bar-cont .kill-bar-item"
      );
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        item.classList.remove("red", "blue");
        if (!settings.colored_killfeed) continue;
        const killer = item.querySelector(".killer-name")?.textContent?.trim();
        if (!killer) continue;
        if (redRoster.has(killer)) item.classList.add("red");
        else if (blueRoster.has(killer)) item.classList.add("blue");
      }
    };

    const updateKD = (): void => {
      const kills = document.querySelector(".kill-death .kill") as HTMLElement;
      const deaths = document.querySelector("div > svg.icon-death")?.parentElement as HTMLElement;
      const kd = document.querySelector(".kill-death .kd") as HTMLElement;

      if (!kills || !deaths || !kd) return;

      const killCount = parseFloat(kills.textContent || "0");
      const deathCount = parseFloat(deaths.textContent || "1") || 1;
      let kdRatio = (killCount / deathCount).toFixed(2);

      kd.innerHTML = `<span class="kd-ratio">${kdRatio}</span> <span class="text-kd" style="font-size: 0.75rem;">K/D</span>`;
    };

    const createKD = (): void => {
      if (document.querySelector(".kill-death .kd")) return;
      const kills = document.querySelector(".kill-death .kill") as HTMLElement;
      const deaths = document.querySelector("div > svg.icon-death")?.parentElement as HTMLElement;
      const kd = kills?.cloneNode(true) as HTMLElement;

      if (!kd) return;
      kd.classList.add("kd");
      kd.classList.remove("kill");
      kd.style.display = "flex";
      kd.style.alignItems = "center";
      kd.style.gap = "0.25rem";
      kd.innerHTML = `<span class="kd-ratio">0</span> <span class="text-kd" style="font-size: 0.75rem;">K/D</span>`;

      const killDeath = document.querySelector(".kill-death");
      if (killDeath) killDeath.appendChild(kd);

      const killsObserver = new MutationObserver(updateKD);
      const deathsObserver = new MutationObserver(updateKD);
      if (kills) killsObserver.observe(kills, { childList: true, characterData: true, subtree: true });
      if (deaths) deathsObserver.observe(deaths, { childList: true, characterData: true, subtree: true });

      addCleanupTask(() => {
        killsObserver.disconnect();
        deathsObserver.disconnect();
      });
    };

    const addBadge = (badgesElem: HTMLElement, src: string, badgeStyle: string): void => {
      const children = badgesElem.children;
      for (let k = 0; k < children.length; k++) {
        if ((children[k] as HTMLImageElement).src === src) return;
      }
      const img = document.createElement("img");
      img.src = src;
      img.style.cssText = badgeStyle;
      badgesElem.appendChild(img);
    };

    const processGameInterface = (): void => {
      const tabplayers = document.querySelectorAll(".desktop-game-interface .player-cont");

      if (settings.customizations) {
        for (let i = 0; i < tabplayers.length; i++) {
          const player = tabplayers[i];
          const playerLeft = player.querySelector(".player-left") as HTMLElement;
          const nickname = player.querySelector(".nickname") as HTMLElement;
          const shortIdEl = player.querySelector(".short-id");
          const shortId = shortIdEl?.textContent?.replace("#", "") || "";

          if (!shortId) {
            player.querySelector(".juice-badges")?.remove();
            if (nickname) nickname.style.cssText = "";
            if (playerLeft) playerLeft.style.cssText = "";
            continue;
          }

          const customs = customizationsMap.get(shortId);

          if (customs) {
            let badgesElem = player.querySelector(".juice-badges") as HTMLElement;

            if (!badgesElem || badgesElem.dataset.shortId !== shortId) {
              badgesElem?.remove();
              badgesElem = document.createElement("div");
              badgesElem.style.cssText = "display: flex; gap: 0.25rem; align-items: center; margin-left: 0.25rem;";
              badgesElem.className = "juice-badges";
              badgesElem.dataset.shortId = shortId;

              if (nickname) nickname.style.cssText = "overflow: unset;";
              if (playerLeft) {
                playerLeft.style.cssText = "width: 0;";
                playerLeft.insertBefore(badgesElem, playerLeft.lastChild);
              }
            }

            const badgeStyle = "height: 22px; width: auto;";

            if (customs.gradient) {
              if (nickname) {
                const gradientRot = customs.gradient.rot;
                const gradientStops = customs.gradient.stops.join(", ");
                const gradientShadow = customs.gradient.shadow || "0 0 0 transparent";
                nickname.style.cssText = `
                  overflow: unset;
                  background: linear-gradient(${gradientRot}, ${gradientStops}) !important;
                  -webkit-background-clip: text !important;
                  -webkit-text-fill-color: transparent !important;
                  text-shadow: ${gradientShadow} !important;
                  font-weight: 700 !important;
                `;
                nickname.classList.toggle("juice-animated-gradient", !!customs.animated);
              }
            } else {
              if (nickname) {
                nickname.style.cssText = "overflow: unset;";
                nickname.classList.remove("juice-animated-gradient");
              }
            }

            if (customs.discord) addBadge(badgesElem, "https://kirka.lukeskywalk.com/static/linked.png", badgeStyle);
            if (customs.booster) addBadge(badgesElem, "https://kirka.lukeskywalk.com/static/booster.png", badgeStyle);

            if (customs.badges?.length) {
              for (let j = 0; j < customs.badges.length; j++) {
                addBadge(badgesElem, customs.badges[j], badgeStyle);
              }
            }
          } else {
            playerLeft?.querySelector(".juice-badges")?.remove();
            if (nickname) nickname.style.cssText = "";
            if (playerLeft) playerLeft.style.cssText = "";
          }
        }
      } else {
        for (let i = 0; i < tabplayers.length; i++) {
          const player = tabplayers[i];
          player.querySelector(".juice-badges")?.remove();
          const nickname = player.querySelector(".nickname") as HTMLElement;
          const playerLeft = player.querySelector(".player-left") as HTMLElement;
          if (nickname) nickname.style.cssText = "";
          if (playerLeft) playerLeft.style.cssText = "";
        }
      }

      if (!document.querySelector(".kill-death .kd") && settings.kd_indicator) {
        createKD();
      } else if (document.querySelector(".kill-death .kd") && !settings.kd_indicator) {
        document.querySelector(".kill-death .kd")?.remove();
      }

      applyClanGradients();
      updateRosters();
      updateKillFeed();
      applyTabNicknames();

      // Hide the team-state overlay while spectating, if enabled.
      const teamState = document.querySelector(".team-players-state") as HTMLElement | null;
      if (teamState && settings.hide_teamstate_overlay) {
        const spectating = !!document.querySelector("#overlay #fps")?.textContent?.trim();
        teamState.style.visibility = spectating ? "hidden" : "";
      }
    };

    let gameObserver: MutationObserver | null = null;
    let rafScheduled = false;

    const scheduleProcess = (): void => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        processGameInterface();
      });
    };

    const setupGameObserver = (gameInterface: Element): void => {
      processGameInterface();
      gameObserver = new MutationObserver(scheduleProcess);
      gameObserver.observe(gameInterface, { childList: true, subtree: true });
    };

    const gameInterface = document.querySelector(".desktop-game-interface");
    if (gameInterface) {
      setupGameObserver(gameInterface);
    } else {
      const detectInterval = setInterval(() => {
        const gi = document.querySelector(".desktop-game-interface");
        if (gi) {
          clearInterval(detectInterval);
          setupGameObserver(gi);
        }
      }, 250);
      addCleanupTask(() => clearInterval(detectInterval));
    }

    addCleanupTask(() => gameObserver?.disconnect());
  };

  const handleMarket = (): void => {
    // called when user navigates to the market.
  };

  const handleFriends = (): void => {
    const clickHandler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (e.shiftKey && target.classList.contains("online")) {
        const online = target;
        if (online && online.textContent?.includes("in game")) {
          const match = online.textContent.match(/\[(.*?)\]/);
          const content = match ? match[1] : "";
          const gameLink = `${base_url}games/${content}`;
          navigator.clipboard.writeText(gameLink);
          customNotification({
            message: `Copied game link to clipboard: ${gameLink}`,
          });
        }
      }
    };
    document.addEventListener("click", clickHandler);
    addCleanupTask(() => document.removeEventListener("click", clickHandler));

    // ── Friend pinning ──────────────────────────────────────────────────
    const PIN_KEY = "publikc-pinned-friends";
    let pinnedList: string[] = [];
    try {
      pinnedList = JSON.parse(localStorage.getItem(PIN_KEY) || "[]") || [];
    } catch {}
    const pinnedSet = new Set<string>(pinnedList);

    const friendIdOf = (friend: Element): string =>
      friend.querySelector(".friend-id")?.textContent?.trim() || "";

    const pinIcon = (active: boolean): string =>
      active
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;"><defs><linearGradient id="pkc-pin" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff4d4d"/><stop offset="100%" stop-color="#ff0000"/></linearGradient></defs><path d="M12 22C12 22 19 15.5 19 10.5C19 6.35786 15.6421 3 11.5 3C7.35786 3 4 6.35786 4 10.5C4 15.5 12 22 12 22Z" fill="url(#pkc-pin)" stroke="#b30000" stroke-width="1.2" stroke-linejoin="round"/><circle cx="11.5" cy="10.5" r="3" fill="#ffffff" stroke="#ff4d4d" stroke-width="1"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;"><path d="M12 22C12 22 19 15.5 19 10.5C19 6.35786 15.6421 3 11.5 3C7.35786 3 4 6.35786 4 10.5C4 15.5 12 22 12 22Z" fill="none" stroke="#888888" stroke-width="1.5" stroke-linejoin="round"/><circle cx="11.5" cy="10.5" r="3" fill="none" stroke="#888888" stroke-width="1.2"/></svg>`;

    const persistPins = (): void => {
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify(pinnedList));
      } catch {}
    };

    const sortPinned = (): void => {
      const list = document.querySelector(".friends .allo .list");
      if (!list) return;
      const friends = Array.from(list.querySelectorAll(".friend"));
      if (!friends.length) return;
      const ordered = [
        ...friends.filter((f) => pinnedSet.has(friendIdOf(f))),
        ...friends.filter((f) => !pinnedSet.has(friendIdOf(f))),
      ];
      if (ordered.some((f, i) => list.children[i] !== f))
        ordered.forEach((f) => list.appendChild(f));
    };

    const togglePin = (id: string): boolean => {
      if (pinnedSet.has(id)) {
        pinnedSet.delete(id);
        pinnedList = pinnedList.filter((x) => x !== id);
      } else {
        pinnedSet.add(id);
        pinnedList.push(id);
      }
      persistPins();
      sortPinned();
      document.querySelectorAll(".friend-pin-btn").forEach((btn) => {
        const fid = (btn as HTMLElement).dataset.friendId;
        if (fid) btn.innerHTML = pinIcon(pinnedSet.has(fid));
      });
      return pinnedSet.has(id);
    };

    const addPinButton = (friend: Element, id: string): void => {
      if (friend.querySelector(".friend-pin-btn")) return;
      const addDelete = friend.querySelector(".friend-right .add-delete");
      if (!addDelete || addDelete.querySelector(".add")) return; // skip requests

      const btn = document.createElement("div");
      btn.className = "friend-pin-btn";
      btn.dataset.friendId = id;
      btn.style.cssText =
        "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:4px;transition:transform .2s ease;margin-right:8px;vertical-align:middle;";
      btn.innerHTML = pinIcon(pinnedSet.has(id));
      btn.addEventListener("mouseenter", () => (btn.style.transform = "scale(1.1)"));
      btn.addEventListener("mouseleave", () => (btn.style.transform = "scale(1)"));
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.innerHTML = pinIcon(togglePin(id));
      });

      const deleteBtn = addDelete.querySelector(".delete");
      if (deleteBtn) addDelete.insertBefore(btn, deleteBtn);
    };

    const processPins = (): void => {
      const list = document.querySelector(".friends .allo .list");
      if (!list) return;
      list.querySelectorAll(".friend").forEach((friend) => {
        const id = friendIdOf(friend);
        if (id) addPinButton(friend, id);
      });
      sortPinned();
    };

    // ── Spectate buttons ────────────────────────────────────────────────
    const addSpectateButton = (online: Element): void => {
      const next = online.nextElementSibling as HTMLElement | null;
      if (next?.classList.contains("spectate-eye")) return;
      const code = online.textContent?.match(/\[(.*?)\]/)?.[1] || "";
      if (!code) return;

      const eye = document.createElement("div");
      eye.className = "spectate-eye";
      eye.innerHTML = '<i class="fa-solid fa-eye"></i>';
      eye.style.cssText =
        "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin-left:8px;padding:4px;background:#2f3957;border-radius:4px;color:#ffb914;transition:all .2s ease;";
      eye.addEventListener("mouseenter", () => {
        eye.style.background = "#3e4d7c";
        eye.style.transform = "scale(1.05)";
      });
      eye.addEventListener("mouseleave", () => {
        eye.style.background = "#2f3957";
        eye.style.transform = "scale(1)";
      });
      online.insertAdjacentElement("afterend", eye);

      eye.addEventListener("click", (e) => {
        e.stopPropagation();
        (document.querySelector(".home") as HTMLElement)?.click();
        setTimeout(() => {
          (document.querySelector(".join-btn") as HTMLElement)?.click();
          setTimeout(() => {
            const input = document.querySelector(".input") as HTMLInputElement | null;
            if (input) {
              input.value = code;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              (document.querySelector(".btn:nth-child(2)") as HTMLElement)?.click();
            }
          }, 500);
        }, 500);
      });
    };

    const addSpectateButtons = (): void => {
      document.querySelectorAll(".online").forEach((online) => {
        if (online.textContent?.trim().toLowerCase().includes("in game"))
          addSpectateButton(online);
      });
    };

    const processFriends = (): void => {
      if (!window.location.href.startsWith(base_url + "friends")) {
        return;
      }

      const friendsCont = document.querySelector(".friends > .content > .allo");
      const limit = document.querySelector(
        ".friends > .content > .tabs > .limit"
      ) as HTMLElement;
      const addFriends = document.querySelector(".friends > .add-friends") as HTMLElement;

      if (!friendsCont || !limit || !addFriends) return;

      const friendsList = friendsCont.querySelector(".list");
      const requestsList = friendsCont.querySelector(".requests");

      function createSearch(): void {
        const searchFriends = document.createElement("div");
        searchFriends.className = "search-friends";
        searchFriends.style.cssText = `display: flex; flex-direction: column; align-items: flex-start; margin-top: 1.5rem; padding: 0 1rem;`;
        searchFriends.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: .5rem; width: 100%;">
            <span class="search-text">Search</span>
            <span>Press Enter to search</span>
          </div>
          <input type="text" placeholder="ENTER USERNAME OR ID" class="search-input" style="border: .125rem solid #202639; outline: none; background: #2f3957; width: 100%; height: 2.875rem; padding-left: .5rem; box-sizing: border-box; font-weight: 600; font-size: 1rem; color: #f2f2f2; box-shadow: 0 1px 2px rgba(0,0,0,.4), inset 0 0 8px rgba(0,0,0,.4); border-radius: .25rem;"/>`;
        addFriends.appendChild(searchFriends);

        const searchInput = searchFriends.querySelector(".search-input") as HTMLInputElement;
        searchInput?.addEventListener("input", (e: Event) => {
          const target = e.target as HTMLInputElement;
          const query = target.value.toLowerCase();
          const friends = document.querySelectorAll(".friend");
          for (let i = 0; i < friends.length; i++) {
            const friend = friends[i];
            const friendEl = friend as HTMLElement;
            const nicknameEl = friend.querySelector(".nickname");
            const shortIdEl = friend.querySelector(".friend-id");
            const nickname = nicknameEl?.textContent?.toLowerCase() || "";
            const shortId = shortIdEl?.textContent?.toLowerCase() || "";
            friendEl.style.display =
              nickname.includes(query) || shortId.includes(query)
                ? "flex"
                : "none";
          }
        });
      }

      function createDenyButton(): void {
        const denyRequests = document.createElement("div");
        denyRequests.className = "deny-requests";
        denyRequests.style.cssText = `display: flex; flex-direction: column; align-items: flex-start; margin-top: 1.5rem; padding: 0 1rem;`;
        denyRequests.innerHTML = `
          <span style="margin-bottom: .5rem; font-size: 1rem; font-weight: 600; color: #f2f2f2;">Deny Requests</span>
          <div style="display: flex; gap: 0.25rem; width: 100%;">
            <button class="deny-button text-2" style="cursor: pointer; outline: none; padding: 1rem 0; color: white; width: 100%; height: 2.875rem; display: flex; justify-content: center; align-items: center; font-family: Rowdies; font-size: 0.9rem; background: #e73131; border: 4px solid #e73131; border-top: 4px solid #e24f4f; border-bottom: 4px solid #cb1414;">DENY ALL REQUESTS</button>
            <button class="deny-reset text-2" style="cursor: pointer; outline: none; padding: 1rem 0; color: white; width: 100%; height: 2.875rem; display: none; justify-content: center; align-items: center; font-family: Rowdies; font-size: 0.9rem; background: #ffb914; border: 4px solid #ffb914; border-top: 4px solid #fcd373; border-bottom: 4px solid #b6830e;">BACK</button>
          </div>`;
        addFriends.appendChild(denyRequests);

        const denyButton = denyRequests.querySelector(".deny-button") as HTMLButtonElement;
        const denyReset = denyRequests.querySelector(".deny-reset") as HTMLButtonElement;
        let confirm = true;
        let updating = false;
        let denyInterval: NodeJS.Timeout | undefined;

        const resetButtonState = (): void => {
          if (denyButton) denyButton.textContent = "DENY ALL REQUESTS";
          if (denyReset) denyReset.style.display = "none";
          confirm = true;
          updating = false;
          if (denyInterval) clearInterval(denyInterval);
        };

        const handleDenyReset = (): void => resetButtonState();

        const handleDenyButtonClick = (): void => {
          if (updating || !document.querySelector(".allo > .requests"))
            return resetButtonState();

          if (confirm) {
            if (denyButton) denyButton.textContent = "ARE YOU SURE?";
            if (denyReset) denyReset.style.display = "flex";
            confirm = false;
            return;
          }

          updating = true;
          if (denyButton) denyButton.textContent = "CANCEL";
          if (denyReset) denyReset.style.display = "none";

          const requests = document.querySelectorAll(".requests .friend");
          let index = 0;

          denyInterval = setInterval(() => {
            if (!document.querySelector(".allo > .requests") && updating) return resetButtonState();
            if (!updating) return clearInterval(denyInterval);

            const request = requests[index];
            const deleteButton = request?.querySelector(".delete") as HTMLElement;

            if (deleteButton) deleteButton.click();
            index++;

            if (index >= requests.length) {
              resetButtonState();
              customNotification({ message: "All friend requests have been denied." });
            }
          }, 500);
        };

        denyReset?.addEventListener("click", handleDenyReset);
        denyButton?.addEventListener("click", handleDenyButtonClick);
      }

      if (!addFriends.querySelector(".search-friends")) createSearch();
      if (!addFriends.querySelector(".deny-requests")) createDenyButton();

      if (friendsList) {
        limit.textContent = `${friendsList.children.length}/50`;
        const denyRequests = addFriends.querySelector(".deny-requests") as HTMLElement;
        if (denyRequests) denyRequests.style.display = "none";
      } else if (requestsList) {
        limit.textContent = `${requestsList.children.length} Requests`;
        const denyRequests = addFriends.querySelector(".deny-requests") as HTMLElement;
        if (denyRequests) denyRequests.style.display = "flex";
      } else {
        limit.textContent = "-";
        const denyRequests = addFriends.querySelector(".deny-requests") as HTMLElement;
        if (denyRequests) denyRequests.style.display = "none";
      }

      if (settings.customizations) {
        const friends = document.querySelectorAll(".friend");
        for (let i = 0; i < friends.length; i++) {
          const friend = friends[i];
          const shortIdEl = friend.querySelector(".friend-id");
          let shortId = shortIdEl?.textContent?.replace("#", "").trim() || "";
          if (!shortId) {
            const usernameEl = friend.querySelector(".username") as HTMLElement;
            shortId = usernameEl?.textContent?.split("#").pop()?.trim() || "";
          }
          const customs = customizationsMap.get(shortId);

          if (customs) {
            const nickname = friend.querySelector(".nickname") as HTMLElement;
            if (!nickname) continue;
            nickname.style.cssText = `
            display: flex !important;
            align-items: flex-end !important;
            gap: 0.25rem !important;
            overflow: unset !important;
            `;

            if (customs.gradient)
              nickname.style.cssText = `
              display: flex !important;
              align-items: flex-end !important;
              gap: 0.25rem !important;
              max-width: min-content !important;
              flex-direction: row !important;
              background: linear-gradient(${customs.gradient.rot
                }, ${customs.gradient.stops.join(", ")}) !important;
              -webkit-background-clip: text !important;
              -webkit-text-fill-color: transparent !important;
              text-shadow: ${customs.gradient.shadow || "0 0 0 transparent"
                } !important;
              font-weight: 700 !important;
            `;

            nickname.classList.toggle("juice-animated-gradient", !!(customs.gradient && customs.animated));

            let badgesElem = nickname.querySelector(".juice-badges") as HTMLElement;

            if (!badgesElem || badgesElem.dataset.shortId !== shortId) {
              if (badgesElem) badgesElem.remove();

              badgesElem = document.createElement("div");
              badgesElem.style.cssText =
                "display: flex; gap: 0.25rem; align-items: center; width: 0;";
              badgesElem.className = "juice-badges";
              badgesElem.dataset.shortId = shortId;
              nickname.appendChild(badgesElem);
            } else if (badgesElem.dataset.shortId === shortId) continue;

            const badgeStyle = "height: 18px; width: auto;";

            if (customs.discord) {
              const linkedBadge = document.createElement("img");
              linkedBadge.src = "https://kirka.lukeskywalk.com/static/linked.png";
              linkedBadge.style.cssText = badgeStyle;
              badgesElem.appendChild(linkedBadge);
            }

            if (customs.booster) {
              const boosterBadge = document.createElement("img");
              boosterBadge.src = "https://kirka.lukeskywalk.com/static/booster.png";
              boosterBadge.style.cssText = badgeStyle;
              badgesElem.appendChild(boosterBadge);
            }

            if (customs.badges && customs.badges.length) {
              for (let j = 0; j < customs.badges.length; j++) {
                const badge = customs.badges[j];
                const img = document.createElement("img");
                img.src = badge;
                img.style.cssText = badgeStyle;
                badgesElem.appendChild(img);
              }
            }
          }
        }
      }

      processPins();
      addSpectateButtons();
    };

    const observer = new MutationObserver(() => {
      processFriends();
    });

    const friendsContainer = document.querySelector(".friends") || document.body;
    observer.observe(friendsContainer, { childList: true, subtree: true });
    addCleanupTask(() => observer.disconnect());

    processFriends();
  };

  const customNotification = (data: { message: string; icon?: string }): void => {
    const notifElement = document.createElement("div");
    notifElement.classList.add("vue-notification-wrapper");
    notifElement.style.cssText =
      "transition-timing-function: ease; transition-delay: 0s; transition-property: all;";
    notifElement.innerHTML = `
    <div
      style="
        display: flex;
        align-items: center;
        padding: .9rem 1.1rem;
        margin-bottom: .5rem;
        color: var(--white);
        cursor: pointer;
        box-shadow: 0 0 0.7rem rgba(0,0,0,.25);
        border-radius: .2rem;
        background: linear-gradient(262.54deg,#202639 9.46%,#223163 100.16%);
        margin-left: 1rem;
        border: solid .15rem #ffb914;
        font-family: Exo\ 2;" class="alert-default"
    > ${data.icon
        ? `
        <img
          src="${data.icon}"
          style="
            min-width: 2rem;
            height: 2rem;
            margin-right: .9rem;"
        />`
        : ""
      }
      <span style="font-size: 1rem; font-weight: 600; text-align: left;" class="text">${data.message
      }</span>
    </div>`;

    const notifGroups = document.getElementsByClassName("vue-notification-group");
    if (notifGroups[0] && notifGroups[0].children[0]) {
      notifGroups[0].children[0].appendChild(notifElement);
    }

    setTimeout(() => {
      try {
        notifElement.remove();
      } catch { }
    }, 5000);
  };

  ipcRenderer.on("notification", (_: any, data: NotificationData) => customNotification(data));

  ipcRenderer.on("url-change", (_: any, url: string) => {
    runCleanup();

    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.trace = originalConsole.trace;
    if (url === `${base_url}`) {
      handleLobby();
      handleInGame();
    }
    if (url.startsWith(`${base_url}games`)) handleInGame();
    if (url.startsWith(`${base_url}servers/`)) handleServers();
    if (url.startsWith(`${base_url}profile/`)) handleProfile();
    if (url === `${base_url}hub/market`) handleMarket();
    if (url === `${base_url}friends`) handleFriends();
  });

  const handleInitialLoad = (): void => {
    const url = window.location.href;
    if (url === `${base_url}`) {
      handleLobby();
      handleInGame();
    }
    if (url.startsWith(`${base_url}games`)) handleInGame();
    if (url.startsWith(`${base_url}servers/`)) handleServers();
    if (url.startsWith(`${base_url}profile/`)) handleProfile();
    if (url === `${base_url}hub/market`) handleMarket();
    if (url === `${base_url}friends`) handleFriends();

    loadTheme();
    applyUIFeatures();
    applyWatermark();
    applyAlwaysShowMenu();
  };

  handleInitialLoad();
});

import Menu from "./menu";
import { opener } from "../addons/opener";
import { customReqScripts } from "../addons/customReqScripts";
import { ipcRenderer } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { Settings, NewsItem, UserCustomization, User, NotificationData, SettingsChangedEvent, MapImages } from '../types';

const scriptsPath: string = ipcRenderer.sendSync("get-scripts-path");
const scripts: string[] = fs.readdirSync(scriptsPath);

const settings: Settings = ipcRenderer.sendSync("get-settings");
const base_url: string = settings.base_url;

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

let customizationsMap = new Map<string, UserCustomization>();
const updateCustomizationsMap = (customizations: UserCustomization[]): void => {
  customizationsMap.clear();
  if (customizations && Array.isArray(customizations)) {
    for (let i = 0; i < customizations.length; i++) {
      customizationsMap.set(customizations[i].shortId, customizations[i]);
    }
  }
};

if (!window.location.href.startsWith(base_url)) {
  (window as any).process = undefined;
  (window as any).require = undefined;
} else {
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

  opener();
  customReqScripts(settings);

  const fetchAll = async (): Promise<void> => {
    const [customizations, user] = await Promise.all([
      fetch("https://kirka.lukeskywalk.com/static/customizations.json").then((r) =>
        r.json()
      ),
      fetch(`https://api.kirka.io/api/user`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }).then((r) => r.json()),
    ]);

    localStorage.setItem(
      "juice-customizations",
      JSON.stringify(customizations)
    );
    localStorage.setItem(
      "current-user",
      JSON.stringify(user.statusCode === 401 ? "" : user)
    );

    updateCustomizationsMap(customizations);
  };
  fetchAll();

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
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      top: 178px;
      left: 148px;
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
      const settings = ipcRenderer.sendSync("get-settings");
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
      const settings = ipcRenderer.sendSync("get-settings");
      const styles: string[] = [];

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
        "interface_opacity",
        "interface_bounds",
        "hitmarker_link",
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

  const handleLobby = (): void => {
    const settings = ipcRenderer.sendSync("get-settings");

    lobbyKeybindReminder(settings);
    lobbyNews(settings);
    juiceDiscordButton();

    const currentUser = JSON.parse(localStorage.getItem("current-user") || "{}");

    const applyCustomizations = (): void => {
      const customs = customizationsMap.get(currentUser?.shortId);
      if (customs) {
        const lobbyNickname = document.querySelector(
          ".team-section .heads .nickname"
        ) as HTMLElement;

        if (!lobbyNickname) return;

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

        if (lobbyNickname.querySelector(".juice-badges")) return;

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
      }
    };

    const removeCustomizations = (): void => {
      const lobbyNickname = document.querySelector(
        ".team-section .heads .nickname"
      ) as HTMLElement;
      if (!lobbyNickname) return;
      lobbyNickname.style.cssText =
        "display: flex; align-items: flex-end; gap: 0.25rem;";
      lobbyNickname.querySelector(".juice-badges")?.remove();
    };

    if (settings.customizations) applyCustomizations();

    const customizationsChangedHandler = (event: Event): void => {
      const customEvent = event as SettingsChangedEvent;
      if (customEvent.detail.setting === "customizations")
        customEvent.detail.value ? applyCustomizations() : removeCustomizations();
    };
    document.addEventListener("juice-settings-changed", customizationsChangedHandler);
    addCleanupTask(() => document.removeEventListener("juice-settings-changed", customizationsChangedHandler));
  };

  const handleServers = async (): Promise<void> => {
    const mapImages: MapImages = await fetch(
      "https://raw.githubusercontent.com/SheriffCarry/KirkaSkins/main/maps/full_mapimages.json"
    ).then((res) => res.json());

    const mapImageKeys = Object.keys(mapImages);
    for (let i = 0; i < mapImageKeys.length; i++) {
      const item = mapImageKeys[i];
      if (!mapImages[item].includes("https")) {
        mapImages[item] =
          "https://raw.githubusercontent.com/SheriffCarry/KirkaSkins/main" +
          mapImages[item];
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
    const settings = ipcRenderer.sendSync("get-settings");

    const processProfile = (): void => {
      if (!window.location.href.startsWith(base_url + "profile/")) {
        return;
      }

      if (document.querySelector(".profile > .content")) {

        const profile = document.querySelector(
          ".content > .profile-cont > .profile"
        ) as HTMLElement;
        const content = profile?.querySelector(".profile > .content") as HTMLElement;
        const statistics = document.querySelectorAll(".statistic");
        const progressExp = document.querySelector(".progress-exp") as HTMLElement;

        if (!profile || !content) return;

        profile.style.cssText = "width: unset; min-width: 60rem;";
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

        for (let i = 0; i < statistics.length; i++) {
          const stat = statistics[i];
          const nameEl = stat.querySelector(".stat-name");
          const valueEl = stat.querySelector(".stat-value");
          if (!nameEl || !valueEl) continue;
          const name = nameEl.textContent || "";
          const value = valueEl.textContent || "";

          if (name === "kills") kills = value;
          if (name === "deaths") deaths = value;

          if (stat.textContent?.includes(".")) continue;

          valueEl.textContent = value.replace(
            value.split(" ")[0],
            parseInt(value.split(" ")[0]).toLocaleString()
          );
        }

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

    processProfile();
  };

  const handleInGame = (): void => {
    let settings = ipcRenderer.sendSync("get-settings");

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

    const inGameSettingsChangedHandler = (event: Event): void => {
      const customEvent = event as SettingsChangedEvent;
      if (customEvent.detail.setting === "kd_indicator") settings.kd_indicator = customEvent.detail.value;
      else if (customEvent.detail.setting === "customizations") settings.customizations = customEvent.detail.value;
    };
    document.addEventListener("juice-settings-changed", inGameSettingsChangedHandler);
    addCleanupTask(() => document.removeEventListener("juice-settings-changed", inGameSettingsChangedHandler));

    const handleInGameInterval = function() {
      if (!document.querySelector(".desktop-game-interface")) {
        clearInterval(inGameInterval);
        return;
      }

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
            } else {
              badgesElem.innerHTML = "";
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
              }
            } else {
              if (nickname) nickname.style.cssText = "overflow: unset;";
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
    };
    const inGameInterval = setInterval(handleInGameInterval, 1000);
    addCleanupTask(() => clearInterval(inGameInterval));
  };

  const handleMarket = (): void => {
    // called when user navigates to the market.
  };

  const handleFriends = (): void => {
    const settings = ipcRenderer.sendSync("get-settings");

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
          const shortId = shortIdEl?.textContent || "";
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
              max-width: min-width !important;
              flex-direction: row !important;
              background: linear-gradient(${customs.gradient.rot
                }, ${customs.gradient.stops.join(", ")}) !important;
              -webkit-background-clip: text !important;
              -webkit-text-fill-color: transparent !important;
              text-shadow: ${customs.gradient.shadow || "0 0 0 transparent"
                } !important;
              font-weight: 700 !important;
            `;

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
  };

  handleInitialLoad();
});

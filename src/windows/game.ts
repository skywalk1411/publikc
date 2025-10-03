import { BrowserWindow, ipcMain, app, shell } from "electron";
import { default_settings, allowed_urls } from "../util/defaults.json";
import { registerShortcuts } from "../util/shortcuts";
import { applySwitches } from "../util/switches";
import DiscordRPC from "../addons/rpc";
import * as path from "path";
import Store from "electron-store";
import * as fs from "fs";
import type { Settings } from '../types';

const store = new Store();
if (!store.has("settings")) {
  store.set("settings", default_settings);
}

const settings = store.get("settings") as Settings;

for (const key in default_settings) {
  if (
    !settings.hasOwnProperty(key) ||
    typeof settings[key] !== typeof default_settings[key]
  ) {
    settings[key] = default_settings[key];
    store.set("settings", settings);
  }
}

if (!allowed_urls.includes(settings.base_url)) {
  settings.base_url = default_settings.base_url;
  store.set("settings", settings);
}

ipcMain.on("get-settings", (e) => {
  e.returnValue = settings;
});

ipcMain.on("update-setting", (e, key: string, value: any) => {
  settings[key] = value;
  store.set("settings", settings);
});

ipcMain.on("open-swapper-folder", () => {
  const swapperPath = path.join(
    app.getPath("documents"),
    "publikc/swapper/assets"
  );

  if (!fs.existsSync(swapperPath)) {
    fs.mkdirSync(swapperPath, { recursive: true });
    shell.openPath(swapperPath);
  } else {
    shell.openPath(swapperPath);
  }
});

ipcMain.on("open-scripts-folder", () => {
  const scriptsPath = path.join(
    app.getPath("documents"),
    "publikc/scripts"
  );

  if (!fs.existsSync(scriptsPath)) {
    fs.mkdirSync(scriptsPath, { recursive: true });
    shell.openPath(scriptsPath);
  } else {
    shell.openPath(scriptsPath);
  }
});

ipcMain.on("reset-juice-settings", () => {
  store.set("settings", default_settings);
  app.relaunch();
  app.quit();
});

let gameWindow: BrowserWindow & { DiscordRPC?: DiscordRPC } | null;

applySwitches(settings);

const createWindow = (): void => {
  gameWindow = new BrowserWindow({
    fullscreen: settings.auto_fullscreen,
    icon: path.join(__dirname, "../assets/img/icon.png"),
    title: "publikc",
    width: 1280,
    height: 720,
    show: false,
    backgroundColor: "#141414",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      preload: path.join(__dirname, "../preload/game.js"),
    },
  });

  gameWindow.once("ready-to-show", async () => {
    if (process.platform === "win32") {
      const { default: enject } = await import("@juice-client/node-enject");

      const handleBuffer = gameWindow!.getNativeWindowHandle();
      let hwnd: number;

      if (process.arch === "x64" || process.arch === "arm64")
        hwnd = Number(handleBuffer.readBigUInt64LE(0));
      else
        hwnd = handleBuffer.readUInt32LE(0);

      enject.startHook(hwnd);
    }

    gameWindow!.show();
  });

  const scriptsPath = path.join(
    app.getPath("documents"),
    "publikc",
    "scripts"
  );
  if (!fs.existsSync(scriptsPath)) {
    fs.mkdirSync(scriptsPath, { recursive: true });
  }

  ipcMain.on("get-scripts-path", (e) => {
    e.returnValue = scriptsPath;
  });

  gameWindow.webContents.on("new-window", (e, url) => {
    e.preventDefault();
    require("electron").shell.openExternal(url);
  });

  gameWindow.webContents.on("did-navigate-in-page", (e, url) => {
    gameWindow!.webContents.send("url-change", url);

    if (settings.discord_rpc && gameWindow!.DiscordRPC) {
      const base_url = settings.base_url;
      const stateMap: { [key: string]: string } = {
        [`${base_url}`]: "In the lobby",
        [`${base_url}hub/leaderboard`]: "Viewing the leaderboard",
        [`${base_url}hub/clans/champions-league`]:
          "Viewing the clan leaderboard",
        [`${base_url}hub/clans/my-clan`]: "Viewing their clan",
        [`${base_url}hub/market`]: "Viewing the market",
        [`${base_url}hub/live`]: "Viewing videos",
        [`${base_url}hub/news`]: "Viewing news",
        [`${base_url}hub/terms`]: "Viewing the terms of service",
        [`${base_url}store`]: "Viewing the store",
        [`${base_url}servers/main`]: "Viewing main servers",
        [`${base_url}servers/parkour`]: "Viewing parkour servers",
        [`${base_url}servers/custom`]: "Viewing custom servers",
        [`${base_url}quests/hourly`]: "Viewing hourly quests",
        [`${base_url}friends`]: "Viewing friends",
        [`${base_url}inventory`]: "Viewing their inventory",
      };

      let state: string;

      if (stateMap[url]) {
        state = stateMap[url];
      } else if (url.startsWith(`${base_url}games/`)) {
        state = "In a match";
      } else if (url.startsWith(`${base_url}profile/`)) {
        state = "Viewing a profile";
      } else {
        state = "In the lobby";
      }

      gameWindow!.DiscordRPC.setState(state);
    }
  });

  gameWindow.loadURL(settings.base_url);
  gameWindow.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.116 Safari/537.36 Electron/10.4.7 publikc/${app.getVersion()}`
  );
  gameWindow.removeMenu();
  gameWindow.maximize();

  gameWindow.once("ready-to-show", () => {
    gameWindow!.show();
  });

  registerShortcuts(gameWindow);

  gameWindow.on("page-title-updated", (e) => e.preventDefault());

  gameWindow.on("closed", () => {
    ipcMain.removeAllListeners("get-settings");
    ipcMain.removeAllListeners("update-setting");
    gameWindow = null;
  });
};

export const initGame = (): void => {
  createWindow();
  if (settings.discord_rpc) {
    gameWindow!.DiscordRPC = new DiscordRPC();
  }
};

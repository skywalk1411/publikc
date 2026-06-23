import { BrowserWindow, ipcMain, app, shell, dialog } from "electron";
import { default_settings, allowed_urls } from "../util/defaults.json";
import { registerShortcuts } from "../util/shortcuts";
import { applySwitches } from "../util/switches";
import DiscordRPC from "../addons/rpc";
import ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import Store from "electron-store";
import * as fs from "fs";
import type { Settings } from '../types';

// ffmpeg-static ships no type declarations and simply exports the binary path.
// When packaged into an asar the binary must be read from the unpacked copy.
const ffmpegStaticPath: string = require("ffmpeg-static");
const ffmpegBinary = ffmpegStaticPath.includes("app.asar")
  ? ffmpegStaticPath.replace("app.asar", "app.asar.unpacked")
  : ffmpegStaticPath;
ffmpeg.setFfmpegPath(ffmpegBinary);

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

const scriptsPath = path.join(
  app.getPath("documents"),
  "publikc",
  "scripts"
);
if (!fs.existsSync(scriptsPath)) {
  fs.mkdirSync(scriptsPath, { recursive: true });
}

const BUNDLED_SCRIPTS = ["csl4.js", "globalChatStats.js", "Playercount.js"];
const bundledScriptsDir = path.join(__dirname, "../scripts/");
for (let i = 0; i < BUNDLED_SCRIPTS.length; i++) {
  const script = BUNDLED_SCRIPTS[i];
  const source = path.join(bundledScriptsDir, script);
  const dest = path.join(scriptsPath, script);
  if (fs.existsSync(source) && !fs.existsSync(dest)) {
    try {
      fs.copyFileSync(source, dest);
    } catch {}
  }
}

ipcMain.on("get-scripts-path", (e) => {
  e.returnValue = scriptsPath;
});

// Lets the user pick a font file for the custom menu theme. The chosen file is
// copied into userData/fonts so it survives even if the original is moved, and
// the stored copy's path is handed back to the renderer for @font-face use.
ipcMain.handle("upload-custom-font", async () => {
  const picked = (await dialog.showOpenDialog({
    title: "Choose a font file",
    properties: ["openFile"],
    filters: [{ name: "Fonts", extensions: ["ttf", "otf", "woff", "woff2"] }],
  })) as unknown as { canceled: boolean; filePaths: string[] };

  const source = picked.filePaths && picked.filePaths[0];
  if (picked.canceled || !source) return null;

  const fontsDir = path.join(app.getPath("userData"), "fonts");
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }

  const destination = path.join(fontsDir, path.basename(source));
  fs.copyFileSync(source, destination);
  return destination;
});

ipcMain.handle("remove-custom-font", (_e, fontPath: string) => {
  try {
    if (fontPath && fs.existsSync(fontPath)) fs.unlinkSync(fontPath);
  } catch {}
  return true;
});

// ── Resource swapper: in-menu skin & sound management ──────────────────────
const swapperAsset = (kind: "img" | "media"): string => {
  const dir = path.join(
    app.getPath("documents"),
    "publikc",
    "swapper",
    "assets",
    kind
  );
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

ipcMain.on("save-skin-local", (_e, skinName: string, filePath: string) => {
  fs.copyFileSync(filePath, path.join(swapperAsset("img"), skinName));
});

ipcMain.on("save-skin-from-buffer", (_e, skinName: string, buffer: Buffer) => {
  fs.writeFileSync(path.join(swapperAsset("img"), skinName), buffer);
});

// Transcodes any uploaded audio to the target sound's filename while applying
// the chosen volume gain, then reports the outcome back to the renderer.
ipcMain.on(
  "save-sound",
  (e, soundName: string, filePath: string, volume: string) => {
    try {
      const destination = path.join(swapperAsset("media"), soundName);
      ffmpeg(path.resolve(filePath))
        .audioFilters(`volume=${volume}`)
        .output(destination)
        .on("end", () => e.reply("save-sound-success"))
        .on("error", (err: Error) => e.reply("save-sound-error", err.message))
        .run();
    } catch (err) {
      e.reply("save-sound-error", (err as Error).message);
    }
  }
);

ipcMain.on("open-skins-folder", () => shell.openPath(swapperAsset("img")));
ipcMain.on("open-sounds-folder", () => shell.openPath(swapperAsset("media")));

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
      nodeIntegration: false,
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

  gameWindow.webContents.on("new-window", (e, url) => {
    e.preventDefault();
    require("electron").shell.openExternal(url);
  });

  const base_url = settings.base_url;
  const stateMap: { [key: string]: string } = {
    [base_url]: "In the lobby",
    [`${base_url}hub/leaderboard`]: "Viewing the leaderboard",
    [`${base_url}hub/clans/champions-league`]: "Viewing the clan leaderboard",
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

  gameWindow.webContents.on("did-navigate-in-page", (e, url) => {
    gameWindow!.webContents.send("url-change", url);

    if (settings.discord_rpc && gameWindow!.DiscordRPC) {
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

  registerShortcuts(gameWindow);

  gameWindow.on("page-title-updated", (e) => e.preventDefault());

  gameWindow.on("closed", () => {
    if (gameWindow?.DiscordRPC) {
      gameWindow.DiscordRPC.destroy();
    }
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

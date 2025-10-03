import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { initGame } from "./game";
import * as path from "path";

autoUpdater.autoDownload = true;

autoUpdater.setFeedURL({
  provider: "github",
  owner: "irrvlo",
  repo: "publikc-client",
});

let splashWindow: BrowserWindow | null;

const createWindow = (): void => {
  splashWindow = new BrowserWindow({
    icon: path.join(__dirname, "../assets/img/icon.png"),
    width: 600,
    height: 300,
    show: false,
    frame: false,
    transparent: true,
    fullscreenable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/splash.js"),
    },
  });

  splashWindow.loadFile(path.join(__dirname, "../assets/html/splash.html"));
  splashWindow.once("ready-to-show", () => {
    splashWindow!.show();
    app.isPackaged ? checkForUpdates() : handleClose();
  });

  splashWindow.on("closed", () => {
    ipcMain.removeAllListeners("quit-and-install");
    splashWindow = null;
  });
};

ipcMain.on("quit-and-install", () =>
  setTimeout(() => autoUpdater.quitAndInstall(), 5000)
);

const checkForUpdates = (): void => {
  autoUpdater.on("update-available", () =>
    splashWindow!.webContents.send("update-available")
  );
  autoUpdater.on("update-not-available", () => {
    splashWindow!.webContents.send("update-not-available");
    handleClose();
  });
  autoUpdater.on("update-downloaded", () =>
    splashWindow!.webContents.send("update-downloaded")
  );
  autoUpdater.on("download-progress", (progress) =>
    splashWindow!.webContents.send("download-progress", progress)
  );
  autoUpdater.on("error", ({ message }) => {
    splashWindow!.webContents.send("update-error", message);
    handleClose();
  });
  autoUpdater.checkForUpdates().catch(handleClose);
};

const handleClose = (): void => {
  setTimeout(() => {
    if (splashWindow) {
      initGame();
      splashWindow.close();
    }
  }, 2000);
};

export const initSplash = createWindow;

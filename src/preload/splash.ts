import { ipcRenderer } from "electron";
import { version } from "../../package.json";

document.addEventListener("DOMContentLoaded", () => {
  const versionElement = document.querySelector(".ver") as HTMLElement;
  const statusElement = document.querySelector(".status") as HTMLElement;

  versionElement.textContent = `v${version}`;

  const updateStatus = (status: string) => (statusElement.textContent = status);

  ipcRenderer.send("check-for-updates");
  updateStatus("Checking for updates...");

  ipcRenderer.on("update-available", () =>
    updateStatus("Update available! Downloading...")
  );
  ipcRenderer.on("update-not-available", () =>
    updateStatus("No updates available. Launching...")
  );

  ipcRenderer.on("update-downloaded", () => {
    updateStatus("Update downloaded! Installing...");
    ipcRenderer.send("quit-and-install");
  });

  ipcRenderer.on("download-progress", (_: any, progress: { percent: number }) =>
    updateStatus(`Downloading update: ${Math.round(progress.percent)}%`)
  );
});

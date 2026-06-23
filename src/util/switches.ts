import { app } from "electron";
import { execSync } from "child_process";
import * as os from "os";
import type { Settings } from '../types';

const getGPUMemoryMB = (): number => {
  if (process.platform !== "win32") return 0;
  try {
    const output = execSync(
      "wmic path win32_VideoController get AdapterRAM /format:value",
      { encoding: "utf-8", timeout: 5000 }
    );
    const matches = output.match(/AdapterRAM=(\d+)/g);
    if (!matches) return 0;
    let maxVRAM = 0;
    for (let i = 0; i < matches.length; i++) {
      const value = parseInt(matches[i].split("=")[1]);
      if (value > maxVRAM) maxVRAM = value;
    }
    return Math.floor(maxVRAM / (1024 * 1024));
  } catch {}
  return 0;
};

export function applySwitches(settings: Settings): void {
  if (settings.unlimited_fps) {
    app.commandLine.appendSwitch("disable-frame-rate-limit");
    app.commandLine.appendSwitch("disable-gpu-vsync");
  }

  if (settings.in_process_gpu) {
    app.commandLine.appendSwitch("in-process-gpu");
  }

  app.commandLine.appendSwitch("high-dpi-support", "1");
  app.commandLine.appendSwitch("ignore-gpu-blacklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-accelerated-2d-canvas");
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("disable-software-rasterizer");

  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

  const cpuCount = os.cpus().length;
  app.commandLine.appendSwitch("num-raster-threads", String(Math.min(cpuCount, 4)));

  const gpuMemMB = getGPUMemoryMB();
  if (gpuMemMB > 0) {
    app.commandLine.appendSwitch("force-gpu-mem-available-mb", String(gpuMemMB));
  }

  app.commandLine.appendSwitch("enable-features", "CanvasOop");
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

  app.allowRendererProcessReuse = true;
}

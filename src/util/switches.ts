import { app } from "electron";
import type { Settings } from '../types';

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

  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

  app.commandLine.appendSwitch("num-raster-threads", "4");

  app.commandLine.appendSwitch("enable-webgl2-compute-context");

  app.allowRendererProcessReuse = true;
}

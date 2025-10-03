require("v8-compile-cache");
import { app } from "electron";
import { initGame } from "./windows/game";
//import { initSplash } from "./windows/splash";
import { initResourceSwapper } from "./addons/swapper";

app.on("ready", () => {
  //initSplash();
  initResourceSwapper();
  initGame();
});

app.on("window-all-closed", () => app.quit());

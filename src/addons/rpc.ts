import * as rpc from "discord-rpc";
import { version } from "../../package.json";

interface Activity {
  startTimestamp: number;
  state: string;
  largeImageKey: string;
  largeImageText: string;
  instance: boolean;
  buttons: Array<{ label: string; url: string }>;
}

class DiscordRPC {
  private clientId: string;
  private startTimestamp: number;
  private client: rpc.Client;

  constructor() {
    this.clientId = "1233829658345078846";
    this.startTimestamp = Date.now();
    this.client = new rpc.Client({ transport: "ipc" });
    this.init();
  }

  private init(): void {
    this.client.on("ready", () => this.setActivity());
    this.client.on("disconnected", () => this.login());
    this.login();
  }

  private login(): void {
    this.client.login({ clientId: this.clientId }).catch(console.error);
  }

  setActivity(activity: Activity = this.defaultActivity()): void {
    this.client.setActivity(activity).catch(console.error);
  }

  setState(state: string): void {
    const activity = this.defaultActivity();
    activity.state = state;
    this.setActivity(activity);
  }

  private defaultActivity(): Activity {
    return {
      startTimestamp: this.startTimestamp,
      state: "In the lobby",
      largeImageKey: "publikc",
      largeImageText: `publikc v${version}`,
      instance: false,
      buttons: [
        { label: "Discord", url: "https://discord.gg/jPgezmpNwm" },
      ],
    };
  }
}

export default DiscordRPC;

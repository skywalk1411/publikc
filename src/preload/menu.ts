import { ipcRenderer } from "electron";
import * as fs from "fs";
import * as path from "path";
import { version } from "../../package.json";
import type { Settings } from '../types';

class Menu {
  private settings: Settings;
  private menuCSS: string;
  private menuHTML: string;
  private menu: HTMLDivElement;
  private localStorage: Storage;
  private menuToggle: HTMLElement;
  private tabToContentMap: { [key: string]: HTMLElement };

  constructor() {
    this.settings = ipcRenderer.sendSync("get-settings");
    this.menuCSS = fs.readFileSync(
      path.join(__dirname, "../assets/css/menu.css"),
      "utf8"
    );
    this.menuHTML = fs.readFileSync(
      path.join(__dirname, "../assets/html/menu.html"),
      "utf8"
    );
    this.menu = this.createMenu();
    this.localStorage = window.localStorage;
    this.menuToggle = this.menu.querySelector(".menu")!;
    this.tabToContentMap = {
      ui: this.menu.querySelector("#ui-options")!,
      game: this.menu.querySelector("#game-options")!,
      performance: this.menu.querySelector("#performance-options")!,
      client: this.menu.querySelector("#client-options")!,
      scripts: this.menu.querySelector("#scripts-options")!,
      about: this.menu.querySelector("#about-client")!,
    };
  }

  private createMenu(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.innerHTML = this.menuHTML;
    menu.id = "juice-menu";
    menu.style.cssText =
      "z-index: 99999999; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);";
    const menuCSS = document.createElement("style");
    menuCSS.innerHTML = this.menuCSS;
    menu.prepend(menuCSS);
    document.body.appendChild(menu);
    return menu as HTMLDivElement;
  }

  init(): void {
    this.setVersion();
    this.setUser();
    this.setKeybind();
    this.setTheme();
    this.handleKeyEvents();
    this.initMenu();
    this.handleMenuKeybindChange();
    this.handleMenuInputChanges();
    this.handleMenuSelectChanges();
    this.handleTabChanges();
    this.handleDropdowns();
    this.handleSearch();
    this.handleButtons();
    this.localStorage.getItem("juice-menu-tab")
      ? this.handleTabChange(
          this.menu.querySelector(
            `[data-tab="${this.localStorage.getItem("juice-menu-tab")}"]`
          )!
        )
      : this.handleTabChange(this.menu.querySelector(".juice.tab")!);
  }

  private setVersion(): void {
    const verElements = this.menu.querySelectorAll(".ver");
    for (let i = 0; i < verElements.length; i++) {
      verElements[i].textContent = `v${version}`;
    }
  }

  private setUser(): void {
    const user = JSON.parse(this.localStorage.getItem("current-user") || "null");
    if (user) {
      (this.menu.querySelector(".user") as HTMLElement).textContent = `${user.name}#${user.shortId}`;
    }
  }

  private setKeybind(): void {
    (this.menu.querySelector(
      ".keybind"
    ) as HTMLElement).textContent = `Press ${this.settings.menu_keybind} to toggle menu`;
    if (!this.localStorage.getItem("juice-menu")) {
      this.localStorage.setItem(
        "juice-menu",
        this.menuToggle.getAttribute("data-active")!
      );
    } else {
      this.menuToggle.setAttribute(
        "data-active",
        this.localStorage.getItem("juice-menu")!
      );
    }
  }

  private setTheme(): void {
    this.menu
      .querySelector(".menu")!
      .setAttribute("data-theme", this.settings.menu_theme);
  }

  private handleKeyEvents(): void {
    document.addEventListener("keydown", (e) => {
      if (e.code === this.settings.menu_keybind) {
        const isActive = this.menuToggle.getAttribute("data-active") === "true";
        if (!isActive) {
          document.exitPointerLock();
        }
        this.menuToggle.setAttribute("data-active", String(!isActive));
        this.localStorage.setItem("juice-menu", String(!isActive));
      }
    });
  }

  private initMenu(): void {
    const inputs = this.menu.querySelectorAll<HTMLInputElement>("input[data-setting]");
    const textareas = this.menu.querySelectorAll<HTMLTextAreaElement>("textarea[data-setting]");
    const selects = this.menu.querySelectorAll<HTMLSelectElement>("select[data-setting]");

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const setting = input.dataset.setting!;
      const type = input.type;
      const value = this.settings[setting];
      if (type === "checkbox") {
        input.checked = value;
      } else {
        input.value = value;
      }
    }

    for (let i = 0; i < selects.length; i++) {
      const select = selects[i];
      const setting = select.dataset.setting!;
      const value = this.settings[setting];
      select.value = value;
    }

    for (let i = 0; i < textareas.length; i++) {
      const textarea = textareas[i];
      const setting = textarea.dataset.setting!;
      const value = this.settings[setting];
      textarea.value = value;
    }
  }

  private handleMenuKeybindChange(): void {
    const changeKeybindButton = this.menu.querySelector(".change-keybind") as HTMLElement;
    changeKeybindButton.textContent = this.settings.menu_keybind;
    changeKeybindButton.addEventListener("click", () => {
      changeKeybindButton.textContent = "Press any key";
      const listener = (e: KeyboardEvent) => {
        this.settings.menu_keybind = e.code;
        changeKeybindButton.textContent = e.code;
        ipcRenderer.send("update-setting", "menu_keybind", e.code);

        const event = new CustomEvent("juice-settings-changed", {
          detail: { setting: "menu_keybind", value: e.code },
        });
        document.dispatchEvent(event);

        (this.menu.querySelector(
          ".keybind"
        ) as HTMLElement).textContent = `Press ${this.settings.menu_keybind} to toggle menu`;
        document.removeEventListener("keydown", listener);
      };
      document.addEventListener("keydown", listener);
    });
  }

  private handleMenuInputChange(input: HTMLInputElement | HTMLTextAreaElement): void {
    const setting = input.dataset.setting!;
    const type = (input as HTMLInputElement).type;
    const value = type === "checkbox" ? (input as HTMLInputElement).checked : input.value;
    this.settings[setting] = value;
    ipcRenderer.send("update-setting", setting, value);
    const event = new CustomEvent("juice-settings-changed", {
      detail: { setting: setting, value: value },
    });
    document.dispatchEvent(event);
  }

  private handleMenuInputChanges(): void {
    const inputs = this.menu.querySelectorAll<HTMLInputElement>("input[data-setting]");
    const textareas = this.menu.querySelectorAll<HTMLTextAreaElement>("textarea[data-setting]");
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      input.addEventListener("change", () => this.handleMenuInputChange(input));
    }

    for (let i = 0; i < textareas.length; i++) {
      const textarea = textareas[i];
      textarea.addEventListener("change", () =>
        this.handleMenuInputChange(textarea)
      );
    }
  }

  private handleMenuSelectChange(select: HTMLSelectElement): void {
    const setting = select.dataset.setting!;
    const value = select.value;
    this.settings[setting] = value;
    ipcRenderer.send("update-setting", setting, value);
    const event = new CustomEvent("juice-settings-changed", {
      detail: { setting: setting, value: value },
    });
    if (setting === "menu_theme") {
      this.setTheme();
    }
    document.dispatchEvent(event);
  }

  private handleMenuSelectChanges(): void {
    const selects = this.menu.querySelectorAll<HTMLSelectElement>("select[data-setting]");
    for (let i = 0; i < selects.length; i++) {
      const select = selects[i];
      select.addEventListener("change", () =>
        this.handleMenuSelectChange(select)
      );
    }
  }

  private handleTabChanges(): void {
    const tabs = this.menu.querySelectorAll<HTMLElement>(".juice.tab");
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      tab.addEventListener("click", () => this.handleTabChange(tab));
    }
  }

  private handleTabChange(tab: HTMLElement): void {
    const tabs = this.menu.querySelectorAll(".juice.tab");
    const tabName = tab.dataset.tab!;

    this.localStorage.setItem("juice-menu-tab", tabName);

    const contents = this.menu.querySelectorAll(".juice.options");
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].classList.remove("active");
    }
    for (let i = 0; i < contents.length; i++) {
      contents[i].classList.remove("active");
    }
    tab.classList.add("active");
    this.tabToContentMap[tab.dataset.tab!].classList.add("active");
  }

  private handleDropdowns(): void {
    const dropdowns = this.menu.querySelectorAll(".dropdown");
    for (let i = 0; i < dropdowns.length; i++) {
      const dropdown = dropdowns[i];
      const dropdownTop = dropdown.querySelector(".dropdown .top") as HTMLElement;
      dropdownTop.addEventListener("click", () => {
        dropdown.classList.toggle("active");
      });
    }
  }

  private handleSearch(): void {
    const searchInput = this.menu.querySelector(".juice.search") as HTMLInputElement;
    const settings = this.menu.querySelectorAll<HTMLElement>(".option:not(.custom)");
    searchInput.addEventListener("input", () => {
      const searchValue = searchInput.value.toLowerCase();
      for (let i = 0; i < settings.length; i++) {
        const setting = settings[i];
        setting.style.display = setting.textContent!
          .toLowerCase()
          .includes(searchValue)
          ? "flex"
          : "none";

        const parent = setting.parentElement as HTMLElement;
        if (parent.classList.contains("option-group")) {
          const children = parent.children;
          let visibleCount = 0;
          for (let j = 0; j < children.length; j++) {
            if ((children[j] as HTMLElement).style.display === "flex") {
              visibleCount++;
            }
          }
          parent.style.display = visibleCount ? "flex" : "none";
        }
      }
    });
  }

  private handleButtons(): void {
    const openSwapperFolder = this.menu.querySelector("#open-swapper-folder") as HTMLElement;
    openSwapperFolder.addEventListener("click", () => {
      ipcRenderer.send("open-swapper-folder");
    });

    const openScriptsFolder = this.menu.querySelector("#open-scripts-folder") as HTMLElement;
    openScriptsFolder.addEventListener("click", () => {
      ipcRenderer.send("open-scripts-folder");
    });

    const importSettings = this.menu.querySelector("#import-settings") as HTMLElement;
    importSettings.addEventListener("click", () => {
      const modal = this.createModal(
        "Import settings",
        "Paste your settings here to import them"
      );

      const bottom = modal.querySelector(".bottom")!;

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Paste settings here";
      bottom.appendChild(input);

      const confirm = document.createElement("button");
      confirm.textContent = "Confirm";
      confirm.classList.add("juice-button");
      confirm.addEventListener("click", () => {
        try {
          if (!input.value) return;

          const settings = JSON.parse(input.value);
          const settingsKeys = Object.keys(settings);
          for (let i = 0; i < settingsKeys.length; i++) {
            const key = settingsKeys[i];
            this.settings[key] = settings[key];
            ipcRenderer.send("update-setting", key, settings[key]);

            const event = new CustomEvent("juice-settings-changed", {
              detail: { setting: key, value: settings[key] },
            });
            document.dispatchEvent(event);

            this.initMenu();
          }
          modal.remove();
        } catch (error) {
          console.error("Error importing settings:", error);
        }
      });

      bottom.appendChild(confirm);

      this.menu.querySelector(".menu")!.appendChild(modal);
    });

    const exportSettings = this.menu.querySelector("#export-settings") as HTMLElement;
    exportSettings.addEventListener("click", () => {
      const modal = this.createModal(
        "Export settings",
        "Copy your settings here to export them"
      );

      const bottom = modal.querySelector(".bottom")!;

      const textarea = document.createElement("textarea");
      textarea.value = JSON.stringify(this.settings, null, 2);
      bottom.appendChild(textarea);

      const copy = document.createElement("button");
      copy.textContent = "Copy";
      copy.classList.add("juice-button");
      copy.addEventListener("click", () => {
        navigator.clipboard.writeText(textarea.value);
      });

      bottom.appendChild(copy);

      this.menu.querySelector(".menu")!.appendChild(modal);
    });

    let clickCounter = 0;
    const resetJuiceSettings = this.menu.querySelector("#reset-juice-settings") as HTMLElement;
    resetJuiceSettings.addEventListener("click", () => {
      clickCounter++;
      if (clickCounter === 1) {
        resetJuiceSettings.style.background = "rgba(var(--red), 0.25)";
        const text = resetJuiceSettings.querySelector(".text") as HTMLElement;
        text.textContent = "Are you sure?";

        const description = resetJuiceSettings.querySelector(".description") as HTMLElement;
        description.textContent =
          "This will restart the client and reset all settings. Click again to confirm";
      } else if (clickCounter === 2) {
        ipcRenderer.send("reset-juice-settings");
      }
    });

    const remoteToStaticLinks = this.menu.querySelector(
      "#remote-to-static-links"
    ) as HTMLElement;
    remoteToStaticLinks.addEventListener("click", async () => {
      const localStorageKeys = [
        "SETTINGS___SETTING/CROSSHAIR___SETTING/STATIC_URL___SETTING",
        "SETTINGS___SETTING/SNIPER___SETTING/SCOPE_URL___SETTING",
        "SETTINGS___SETTING/BLOCKS___SETTING/TEXTURE_URL___SETTING",
        "SETTINGS___SETTING/SKYBOX___SETTING/TEXTURE_IMG1___SETTING",
        "SETTINGS___SETTING/SKYBOX___SETTING/TEXTURE_IMG2___SETTING",
        "SETTINGS___SETTING/SKYBOX___SETTING/TEXTURE_IMG3___SETTING",
        "SETTINGS___SETTING/SKYBOX___SETTING/TEXTURE_IMG4___SETTING",
        "SETTINGS___SETTING/SKYBOX___SETTING/TEXTURE_IMG5___SETTING",
        "SETTINGS___SETTING/SKYBOX___SETTING/TEXTURE_IMG6___SETTING",
      ];

      const juiceKeys = ["css_link", "hitmarker_link", "killicon_link"];

      const encodeImage = async (url: string): Promise<string> => {
        if (!url || url === "") return "";

        try {
          const response = await fetch(url);
          if (!response.ok)
            throw new Error(`Invalid response: ${response.status}`);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error(`Error fetching or converting ${url}:`, error);
          return "";
        }
      };

      for (let i = 0; i < localStorageKeys.length; i++) {
        const key = localStorageKeys[i];
        const url = localStorage.getItem(key)?.replace(/"/g, "") || "";
        const data = await encodeImage(url);
        localStorage.setItem(key, data);
      }

      for (let i = 0; i < juiceKeys.length; i++) {
        const key = juiceKeys[i];
        const url = this.settings[key];
        const data = await encodeImage(url);
        this.settings[key] = data;
        ipcRenderer.send("update-setting", key, data);

        const event = new CustomEvent("juice-settings-changed", {
          detail: { setting: key, value: this.settings[key] },
        });
        document.dispatchEvent(event);

        this.initMenu();
      }
    });
  }

  private createModal(title: string, description: string): HTMLDivElement {
    const modal = document.createElement("div");
    modal.id = "modal";

    modal.innerHTML = `
    <div class="content">
      <div class="close">
        <i class="fas fa-times"></i>
      </div>
      <div class="top">
        <span class="title">${title}</span>
        <span class="description">${description}</span>
      </div>
      <div class="bottom">
      </div>
    </div>
    `;

    const close = modal.querySelector(".close") as HTMLElement;
    close.addEventListener("click", () => modal.remove());

    modal.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "modal") modal.remove();
    });

    return modal as HTMLDivElement;
  }
}

export default Menu;

# Publikc Client

A light Electron client for Kirka.io. Join our [discord](https://discord.gg/jPgezmpNwm) for support and update notifications.

Based on Juice client. [juice github](https://github.com/irrvlo/juice-client)

# Download


Windows releases are not available, feel free to compile your own.

But you can build your own executable (.exe) after you are ready to launch the game in the Install step.

Simply type `npx electron-builder --win` before launching, it will create .exe in the /build folder and use that instead of `npx electron .` to launch.

# Install

- Download all the source
- open cmd.exe in windows
- move to the folder
- install node.js from node.js official website for windows [download node.js](https://nodejs.org/en)
- `npm install`
- `npm i v8-compile-cache --save`
- you can build an executable (.exe) `npx electron-builder --win` they will save in folder /build.
- to launch type: `npx electron .` or launch the executable in /build/publikc-setup-win-*-1.1.*.exe.

# What features does this have?

- Uncapped FPS
- Resource Swapper
- Userscripts
- Automatic Updates
- Discord Rich Presence
- Custom Menu with Themes and Custom Keybinds
- Permanent Crosshair
- Custom Hitmarker (Using Links and Local File Paths)
- Custom Kill Icon (Using Links and Local File Paths)
- Custom CSS (Using Links and Local File Paths) with toggle
- Rave Mode (RGB)
- Hide Chat
- Hide Interface
- UI Animations Toggle
- Skip Loading Screen
- Interface Opacity and Bounds
- Auto Fullscreen
- Experimental Flags
- Pack/Chest Auto Opener
- Shift Clicking a username in Global Chat will open their profile
- Map Images in Server List
- Unofficial News in Lobby
- Market Names
- Custom List Price
- Import/Export/Reset Settings
- Remote to Static Links
- Proxy Link Support
- Menu Keybind Reminder
- No Pulp (aka smooth)

## Hotkeys
| Hotkey | Description |
| ------ | ----------- |
| F2 | Screenshot and copy to clipboard |
| F4 | Return to https://kirka.io |
| F5 | Reload |
| F6 | Load URL |
| F7 | Copy URL |
| F11 | Fullscreen |
| F12 & Ctrl + Shift + I | Open DevTools |

## Known bugs:
- Pulp manifests under rare conditions. 

# Is it safe?

PubliKC Client is 100% completely safe to use. Releases are built on my computer and uploaded to github which has anti-virus or build your own .exe. If you face any issues, join our [discord](https://discord.gg/jPgezmpNwm) to report bugs.

## Credits
- skywalk
- irrvlo
- CarrySheriff for Chest/Pack opener, Map Images Repo, Market Names, and Custom List Price
- AwesomeSam for a basic Resource Swapper
- Error430 for optimizations
- robertpakalns for various bug fixes, optimizations, and tweaks

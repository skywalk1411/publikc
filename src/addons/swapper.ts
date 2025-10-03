import { app, session, protocol } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as url from "url";

export function initResourceSwapper(): void {
  protocol.registerFileProtocol("publikc", (request, callback) =>
    callback({ path: request.url.replace("publikc://", "") })
  );
  protocol.registerFileProtocol("file", (request, callback) => {
    callback(decodeURIComponent(request.url.replace("file:///", "")));
  });

  const SWAP_FOLDER = path.join(
    app.getPath("documents"),
    "publikc",
    "swapper"
  );
  const assetsFolder = path.join(SWAP_FOLDER, "assets");
  const folders = ["css", "media", "img", "glb", "js"];
  let folder_regex_generator = "publikc[\\\\/]swapper[\\\\/]assets[\\\\/](";
  folder_regex_generator += folders.join("|");
  folder_regex_generator += ")[\\\\/][^\\\\/]+\\.[^.]+$";
  const folder_regex = new RegExp(folder_regex_generator, "");

  try {
    if (!fs.existsSync(assetsFolder))
      fs.mkdirSync(assetsFolder, { recursive: true });
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      const folderPath = path.join(assetsFolder, folder);
      if (!fs.existsSync(folderPath))
        fs.mkdirSync(folderPath, { recursive: true });
    }
  } catch (e) {
    console.error(e);
  }

  const swap: {
    filter: { urls: string[] };
    files: { [key: string]: string };
  } = {
    filter: { urls: [] },
    files: {},
  };

  const proxyUrls = [
    "snipers.io",
    "ask101math.com",
    "fpsiogame.com",
    "cloudconverts.com",
    "kirka.io",
  ];

  const allFilesSync = (dir: string): void => {
    const files = fs.readdirSync(dir);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) allFilesSync(filePath);
      else {
        const useAssets = folder_regex.test(filePath);
        if (!useAssets) continue;

        for (let j = 0; j < proxyUrls.length; j++) {
          const proxy = proxyUrls[j];
          const kirk = `*://${proxy}${filePath.replace(SWAP_FOLDER, "").replace(/\\/g, "/")}*`;
          const origfilterurl = kirk.match(/\/[^\/]+\.(?:[a-zA-Z0-9]+)\*/gi)?.[0];
          if (!origfilterurl) continue;

          let filterurl = origfilterurl.replace(/\_/g, "");
          filterurl = filterurl.replace("/", "/*");
          filterurl = filterurl.replace(".", "*.*");
          swap.filter.urls.push(kirk.replace(origfilterurl, filterurl));
          swap.files[kirk.replace(/\*|_/g, "")] = url.format({
            pathname: filePath,
            protocol: "",
            slashes: false,
          });
        }
      }
    }
  };

  allFilesSync(SWAP_FOLDER);

  if (swap.filter.urls.length) {
    session.defaultSession.webRequest.onBeforeRequest(
      swap.filter,
      (details, callback) => {
        const redirect =
          "publikc://" +
          (swap.files[details.url.replace(/https|http|(\?.*)|(#.*)|\_/gi, "")] ||
            details.url);
        callback({ cancel: false, redirectURL: redirect });
      }
    );
  }
}

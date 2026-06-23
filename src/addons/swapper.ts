import { app, session, protocol } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as url from "url";

const fileExtRegex = /\/[^\/]+\.(?:[a-zA-Z0-9]+)\*/i;
const urlStripRegex = /https|http|(\?.*)|(#.*)|_/gi;
const starOrUnderscoreRegex = /\*|_/g;
const underscoreRegex = /_/g;

export async function initResourceSwapper(): Promise<void> {
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
    await fs.promises.mkdir(assetsFolder, { recursive: true });
    for (let i = 0; i < folders.length; i++) {
      await fs.promises.mkdir(path.join(assetsFolder, folders[i]), { recursive: true });
    }
  } catch {}

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

  const allFiles = async (dir: string): Promise<void> => {
    const files = await fs.promises.readdir(dir);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(dir, file);
      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory()) {
        await allFiles(filePath);
      } else {
        const useAssets = folder_regex.test(filePath);
        if (!useAssets) continue;

        for (let j = 0; j < proxyUrls.length; j++) {
          const proxy = proxyUrls[j];
          const kirk = `*://${proxy}${filePath.replace(SWAP_FOLDER, "").replace(/\\/g, "/")}*`;
          const origfilterurl = kirk.match(fileExtRegex)?.[0];
          if (!origfilterurl) continue;

          let filterurl = origfilterurl.replace(underscoreRegex, "");
          filterurl = filterurl.replace("/", "/*");
          filterurl = filterurl.replace(".", "*.*");
          swap.filter.urls.push(kirk.replace(origfilterurl, filterurl));
          swap.files[kirk.replace(starOrUnderscoreRegex, "")] = url.format({
            pathname: filePath,
            protocol: "",
            slashes: false,
          });
        }
      }
    }
  };

  await allFiles(SWAP_FOLDER);

  if (swap.filter.urls.length) {
    session.defaultSession.webRequest.onBeforeRequest(
      swap.filter,
      (details, callback) => {
        const redirect =
          "publikc://" +
          (swap.files[details.url.replace(urlStripRegex, "")] ||
            details.url);
        callback({ cancel: false, redirectURL: redirect });
      }
    );
  }
}

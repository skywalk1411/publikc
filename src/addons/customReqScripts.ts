// from CarrySheriff!

import type { Settings } from '../types';

export function customReqScripts(settings: Settings): void {
  const originalXHR = window.XMLHttpRequest;
  const { base_url, custom_list_price, market_names } = settings;
  let ids: string[] = [];
  let newprice: number;
  let updating = false;

  window.XMLHttpRequest = function () {
    const xhr = new originalXHR();
    let requestUrl = "";

    const originalOpen = xhr.open;
    xhr.open = function (method: string, url: string, ...args: any[]) {
      requestUrl = url;
      originalOpen.apply(this, [method, url, ...args]);
    };

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (
          requestUrl.includes(`api2.${base_url.replace("https://", "")}`) &&
          window.location.href === `${base_url}hub/market` &&
          market_names
        ) {
          ids = [];
          let modifiedResponse = JSON.parse(xhr.responseText);
          try {
            for (let i = 0; i < modifiedResponse.length; i++) {
              const item = modifiedResponse[i];
              if (Object.keys(item).length == 3) {
                const itemKeys = Object.keys(item);
                for (let j = 0; j < itemKeys.length; j++) {
                  const item2 = itemKeys[j];
                  if (typeof item[item2] == "string") {
                    ids.push(item[item2]);
                  }
                }
              }
            }
          } catch {}
          try {
            const jsonResponse = modifiedResponse;
            modifiedResponse = JSON.stringify(jsonResponse);
          } catch (e) {}
          Object.defineProperty(xhr, "responseText", {
            value: modifiedResponse,
          });
        }

        if (
          requestUrl.includes(`api2.${base_url.replace("https://", "")}`) &&
          location.href === `${base_url}inventory` &&
          xhr.responseText &&
          newprice &&
          custom_list_price
        ) {
          try {
            const json = JSON.parse(xhr.responseText);
            if (Object.keys(json).length === 2) {
              const jsonKeys = Object.keys(json);
              for (let i = 0; i < jsonKeys.length; i++) {
                const key = jsonKeys[i];
                if (typeof json[key] === "number" && json[key] !== 0) {
                  json[key] = newprice;
                }
              }
            }
            Object.defineProperty(xhr, "responseText", {
              value: JSON.stringify(json),
            });
          } catch {}
        }
      }
    };

    const originalSend = xhr.send;
    xhr.send = function (data?: Document | XMLHttpRequestBodyInit | null) {
      if (
        requestUrl.includes(`api2.${base_url.replace("https://", "")}`) &&
        location.href === `${base_url}inventory` &&
        document.querySelector(".vm--container > .vm--modal > .wrapper-modal")?.id !== "sell-item-modal" &&
        data &&
        newprice &&
        custom_list_price
      ) {
        try {
          const json = JSON.parse(data as string);
          if (Object.keys(json).length === 2) {
            const jsonKeys = Object.keys(json);
            for (let i = 0; i < jsonKeys.length; i++) {
              const key = jsonKeys[i];
              if (typeof json[key] === "number" && json[key] !== 0) {
                json[key] = newprice;
              }
            }
          }
          data = JSON.stringify(json);
        } catch {}
      }
      originalSend.call(this, data);
    };

    return xhr;
  } as any;

  async function marketUsers(): Promise<void> {
    const itemElements = document.getElementsByClassName("item-name");

    const fetchHeaders = {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      Referer: base_url,
      "Referrer-Policy": "strict-origin-when-cross-origin",
    };

    let count = 0;
    for (let i = 0; i < itemElements.length; i++) {
      const sellerId = ids[i];

      try {
        await new Promise((resolve) => setTimeout(resolve, 200));

        let fetchreq = await fetch(`https://api.kirka.io/api/user/getProfile`, {
          headers: fetchHeaders,
          body: `{"id":"${sellerId}"}`,
          method: "POST",
        });
        const fetchreqJson = await fetchreq.json();
        if (fetchreqJson["shortId"]) {
          count++;
          if (count >= itemElements.length) {
            updating = false;
          }
          itemElements[i].textContent = itemElements[i].textContent?.split(" - ")[0] || "";
          itemElements[i].textContent += ` - ${fetchreqJson["name"]}#${fetchreqJson["shortId"]}`;
        }
      } catch {
        count++;
        if (count === itemElements.length) {
          updating = false;
        }
      }
    }
  }

  const inputElem = Object.assign(document.createElement("input"), {
    id: "juice-custom-listing",
    type: "number",
    min: "0",
    placeholder: "Custom amount",
    onchange: (e: Event) => (newprice = Number((e.target as HTMLInputElement).value)),
  });

  Object.assign(inputElem.style, {
    marginTop: "-.5em",
    marginBottom: "1em",
    border: ".125rem solid #202639",
    outline: "none",
    background: "#2f3957",
    width: "50%",
    height: "2.875rem",
    paddingLeft: ".5rem",
    boxSizing: "border-box",
    fontWeight: "600",
    fontSize: "1rem",
    color: "#f2f2f2",
    boxShadow: "0 1px 2px rgba(0,0,0,.4), inset 0 0 8px rgba(0,0,0,.4)",
    borderRadius: ".25rem",
  });

  const observer = new MutationObserver(() => {
    if (window.location.href === `${base_url}inventory` && custom_list_price) {
      const sellElem = document.querySelector(".cont-sell");
      if (sellElem && !document.getElementById("juice-custom-listing") && sellElem.parentElement?.parentElement?.id !== "sell-item-modal") {
        sellElem.children[1].after(inputElem);
      }
    }

    if (
      window.location.href === `${base_url}hub/market` &&
      document.getElementsByClassName("subjects").length === 2 &&
      !document
        .getElementsByClassName("item-name")[0]
        ?.textContent?.includes(" - ") &&
      !updating &&
      ids.length > 0 &&
      market_names
    ) {
      marketUsers();
      updating = true;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

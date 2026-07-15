import { GlobalRegistrator } from "@happy-dom/global-registrator";

const bunFetch = globalThis.fetch;
const BunHeaders = globalThis.Headers;
const BunRequest = globalThis.Request;
const BunResponse = globalThis.Response;
const BunUrl = globalThis.URL;

GlobalRegistrator.register({
  url: "http://localhost",
});

globalThis.fetch = bunFetch;
globalThis.Headers = BunHeaders;
globalThis.Request = BunRequest;
globalThis.Response = BunResponse;
globalThis.URL = BunUrl;

if (typeof Element.prototype.getAnimations !== "function") {
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
}

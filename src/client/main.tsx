import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/client/app/app";

const rootElement = document.querySelector("#root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Wave Player Next could not find its application root.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

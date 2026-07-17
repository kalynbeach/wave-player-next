import { afterEach, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App, createApplicationRuntime } from "@/client/app/app";

const nativeFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = nativeFetch;
  localStorage.clear();
});

function installApiStub(options: { rejectRootConfiguration?: boolean } = {}) {
  globalThis.fetch = (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url === "/api/library/root" && init?.method === "PUT") {
      if (options.rejectRootConfiguration) {
        return Response.json(
          {
            error: {
              code: "bad_request",
              message: "The test root could not be read.",
            },
          },
          { status: 400 },
        );
      }
    }

    if (url === "/api/library/root") {
      return Response.json({ root: null });
    }
    if (url === "/api/library/tracks") {
      return Response.json({ tracks: [] });
    }
    if (url === "/api/scene-presets") {
      return Response.json({ presets: [] });
    }

    return Response.json(
      { error: { code: "not_found", message: "Test route not found." } },
      { status: 404 },
    );
  }) as typeof fetch;
}

test("renders a named application and withholds tabs before root setup", async () => {
  installApiStub();
  render(<App />);

  expect(
    screen.getByRole("main", { name: "Wave Player Next" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("region", { name: "No track selected" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Connect your local library" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});

test("reports a rejected root request without an unhandled rejection", async () => {
  installApiStub({ rejectRootConfiguration: true });
  const user = userEvent.setup();
  let unhandledRejections = 0;
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    unhandledRejections += 1;
    event.preventDefault();
  };
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  render(<App />);
  await screen.findByRole("heading", { name: "Connect your local library" });
  await user.type(
    screen.getByRole("textbox", { name: "Library folder" }),
    "/missing/audio",
  );
  await user.click(screen.getByRole("button", { name: "Configure and scan" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The test root could not be read.",
  );
  await waitFor(() => expect(unhandledRejections).toBe(0));
  window.removeEventListener("unhandledrejection", onUnhandledRejection);
});

test("keeps one playback runtime and analysis graph across scene changes", () => {
  const runtime = createApplicationRuntime();
  const playback = runtime.playback;
  const playbackSnapshot = playback.getSnapshot();
  const signalProvider = playback.signalProvider;
  const controller = runtime.controller;

  runtime.visualization.selectScene("light-machine");
  runtime.visualization.selectScene("signal");

  expect(runtime.playback).toBe(playback);
  expect(runtime.controller).toBe(controller);
  expect(runtime.playback.signalProvider).toBe(signalProvider);
  expect(runtime.playback.getSnapshot()).toBe(playbackSnapshot);

  runtime.visualization.dispose();
  runtime.controller.destroy();
});

import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import type { CardView } from "@/app/playback/playback-ports";
import type { PlayerSnapshot } from "@/app/playback/player-controller";
import type {
  SignalFrame,
  SignalProvider,
} from "@/app/visualization/signal-provider";
import { PlayerCard } from "@/client/app/player-card";
import { TooltipProvider } from "@/client/components/ui/tooltip";
import { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";
import { VisualizationSceneRegistry } from "@/client/visualization/visualization-scene-registry";
import {
  parseAssetId,
  parseAssetLocationId,
  parseLibraryRootId,
  parseScenePresetId,
  parseTrackId,
} from "@/core/library/ids";
import type { LibraryRoot, LibraryTrack } from "@/core/library/library";
import {
  createDefaultLightMachineSceneState,
  DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
} from "@/core/scene/light-machine-scene";
import {
  LIGHT_MACHINE_SCENE_DEFINITION,
  SIGNAL_SCENE_DEFINITION,
} from "@/core/scene/scene-registry";
import { DEFAULT_SIGNAL_SCENE_PARAMETERS } from "@/core/scene/signal-scene";

const selectedTrack: LibraryTrack = {
  id: parseTrackId("track_00000000-0000-4000-8000-000000000001"),
  title: "Selected Signal",
  asset: {
    id: parseAssetId("asset_00000000-0000-4000-8000-000000000001"),
    format: "wav",
    mimeType: "audio/wav",
    fileSizeBytes: 4_096,
    modifiedAtMs: 1_000,
  },
  location: {
    id: parseAssetLocationId("location_00000000-0000-4000-8000-000000000001"),
    relativePath: "exports/selected-signal.wav",
    available: true,
  },
};

const unavailableTrack: LibraryTrack = {
  ...selectedTrack,
  id: parseTrackId("track_00000000-0000-4000-8000-000000000002"),
  title: "Missing Signal",
  asset: {
    ...selectedTrack.asset,
    id: parseAssetId("asset_00000000-0000-4000-8000-000000000002"),
  },
  location: {
    id: parseAssetLocationId("location_00000000-0000-4000-8000-000000000002"),
    relativePath: "exports/missing.mp3",
    available: false,
  },
};

const root: LibraryRoot = {
  id: parseLibraryRootId("root_00000000-0000-4000-8000-000000000001"),
  canonicalPath: "/tmp/wave-player-library",
  displayName: "wave-player-library",
  enabled: true,
  scanStatus: "ready",
  lastScanStartedAt: "2026-07-15T00:00:00.000Z",
  lastScanCompletedAt: "2026-07-15T00:00:01.000Z",
  lastScanMessage: null,
  supportedFileCount: 2,
  ignoredFileCount: 1,
};

const player: PlayerSnapshot = {
  tracks: [selectedTrack, unavailableTrack],
  selectedTrack,
  playback: {
    status: "paused",
    locationId: selectedTrack.location.id,
    currentTime: 12,
    duration: 180,
    volume: 0.8,
    error: null,
    analysisAvailable: true,
  },
};

const frame: SignalFrame = {
  timestampSeconds: 0,
  sampleRate: 48_000,
  left: new Float32Array(2_048),
  right: new Float32Array(2_048),
  mono: new Float32Array(2_048),
  frequencyBins: new Uint8Array(1_024),
  rms: 0,
  peak: 0,
};

const signalProvider: SignalProvider = {
  isAvailable: () => true,
  readFrame: () => frame,
};

const onTogglePlayback = mock(() => undefined);
let visualizationSession: BrowserVisualizationSession;

function PlayerCardHarness() {
  const [activeView, setActiveView] = useState<CardView>("library");
  const [session] = useState(
    () =>
      new BrowserVisualizationSession({
        registry: new VisualizationSceneRegistry(
          [SIGNAL_SCENE_DEFINITION, LIGHT_MACHINE_SCENE_DEFINITION].map(
            (scene) => ({
              scene,
              createRenderer: async (options) => {
                options.onStatus({ state: "ready" });
                return {
                  setActive: () => undefined,
                  setState: () => undefined,
                  dispose: () => undefined,
                };
              },
            }),
          ),
        ),
        signalProvider,
        random: () => 0.25,
      }),
  );
  visualizationSession = session;

  return (
    <TooltipProvider>
      <PlayerCard
        activeView={activeView}
        busy={false}
        error={null}
        initialLoading={false}
        player={player}
        presets={[
          {
            id: parseScenePresetId(
              "preset_00000000-0000-4000-8000-000000000001",
            ),
            name: "Night trace",
            sceneId: "signal",
            sceneVersion: 1,
            parameters: {
              ...DEFAULT_SIGNAL_SCENE_PARAMETERS,
              mode: "lissajous",
            },
            createdAt: "2026-07-15T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
          {
            id: parseScenePresetId(
              "preset_00000000-0000-4000-8000-000000000002",
            ),
            name: "Prism engine",
            ...createDefaultLightMachineSceneState(),
            parameters: {
              ...DEFAULT_LIGHT_MACHINE_SCENE_PARAMETERS,
              palette: "ultraviolet",
              symmetry: 8,
            },
            createdAt: "2026-07-16T00:00:00.000Z",
            updatedAt: "2026-07-16T00:00:00.000Z",
          },
        ]}
        root={root}
        visualizationSession={session}
        onActiveViewChange={setActiveView}
        onConfigureRoot={mock(async () => undefined)}
        onNext={mock(() => undefined)}
        onPrevious={mock(() => undefined)}
        onSavePreset={mock(async () => undefined)}
        onScan={mock(async () => undefined)}
        onSeek={mock(() => undefined)}
        onSelectTrack={mock(async () => undefined)}
        onTogglePlayback={onTogglePlayback}
        onVolumeChange={mock(() => undefined)}
      />
    </TooltipProvider>
  );
}

test("keeps the named card, transport, and all view panels mounted", async () => {
  const user = userEvent.setup();
  const { container } = render(<PlayerCardHarness />);

  expect(
    screen.getByRole("region", { name: "Selected Signal" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Playback controls" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Missing Signal/ })).toBeDisabled();
  expect(container.querySelectorAll('[data-slot="tabs-content"]')).toHaveLength(
    3,
  );

  const playButton = screen.getByRole("button", { name: "Play" });
  await user.click(playButton);
  expect(onTogglePlayback).toHaveBeenCalledTimes(1);
  const libraryTab = screen.getByRole("tab", { name: "Library" });
  await user.click(libraryTab);
  await user.keyboard("{ArrowRight}");
  const sceneTab = screen.getByRole("tab", { name: "Scene" });
  expect(document.activeElement).toBe(sceneTab);
  await user.keyboard("{Enter}");

  expect(sceneTab.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("button", { name: "Play" })).toBe(playButton);
  const gainSlider = screen
    .getAllByRole("slider", { hidden: true })
    .find((element) => element.getAttribute("aria-label") === "Gain") as
    | HTMLInputElement
    | undefined;
  expect(gainSlider?.getAttribute("aria-label")).toBe("Gain");
  expect(gainSlider?.value).toBe(
    DEFAULT_SIGNAL_SCENE_PARAMETERS.gain.toString(),
  );

  await user.click(screen.getByRole("button", { name: "Lissajous" }));
  expect(
    screen
      .getByRole("button", { name: "Lissajous" })
      .getAttribute("aria-pressed"),
  ).toBe("true");

  await user.click(screen.getByRole("button", { name: "Light machine" }));
  await user.click(screen.getByRole("button", { name: "Light machine" }));
  expect(visualizationSession.getSnapshot().scene.sceneId).toBe(
    "light-machine",
  );
  expect(screen.getByRole("group", { name: "Feedback" })).toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Light-machine symmetry" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Light-machine palette" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Vary" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Play" })).toBe(playButton);
  expect(onTogglePlayback).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "Vary" }));
  expect(visualizationSession.getSnapshot().scene).toMatchObject({
    sceneId: "light-machine",
    parameters: { symmetry: 2, palette: "ember" },
  });
  await user.click(
    screen.getByRole("button", { name: "Reset Light machine parameters" }),
  );
  expect(visualizationSession.getSnapshot().scene).toEqual(
    createDefaultLightMachineSceneState(),
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "Saved scene preset" }),
    "preset_00000000-0000-4000-8000-000000000001",
  );
  expect(visualizationSession.getSnapshot().scene).toMatchObject({
    sceneId: "signal",
    parameters: { mode: "lissajous" },
  });
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Saved scene preset" }),
    "preset_00000000-0000-4000-8000-000000000002",
  );
  expect(visualizationSession.getSnapshot().scene).toMatchObject({
    sceneId: "light-machine",
    parameters: { palette: "ultraviolet", symmetry: 8 },
  });
});

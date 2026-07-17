import {
  ArrowCounterClockwise,
  FloppyDisk,
  ShuffleAngular,
} from "@phosphor-icons/react";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { ScrollArea } from "@/client/components/ui/scroll-area";
import { Slider } from "@/client/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
import type { BrowserVisualizationSession } from "@/client/visualization/browser-visualization-session";
import {
  LIGHT_MACHINE_PALETTES,
  LIGHT_MACHINE_SYMMETRIES,
  type LightMachineSceneState,
} from "@/core/scene/light-machine-scene";
import {
  BUILT_IN_SCENE_REGISTRY,
  type ScenePreset,
} from "@/core/scene/scene-registry";
import type { SignalSceneState } from "@/core/scene/signal-scene";

const SELECTED_TOGGLE_CLASS =
  "aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs";

function ParameterSlider(props: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[6.75rem_1fr_3rem] items-center gap-3">
      <span className="text-xs font-medium">{props.label}</span>
      <Slider
        aria-label={props.label}
        value={props.value}
        min={props.minimum}
        max={props.maximum}
        step={props.step}
        onValueChange={(value) =>
          props.onChange(typeof value === "number" ? value : (value[0] ?? 0))
        }
      />
      <output className="text-right text-[0.625rem] tabular-nums text-muted-foreground">
        {props.value.toFixed(props.step < 1 ? 2 : 0)}
        {props.suffix}
      </output>
    </div>
  );
}

function SignalControls(props: {
  state: SignalSceneState;
  onChange: (state: SignalSceneState) => void;
}) {
  const update = <Key extends keyof SignalSceneState["parameters"]>(
    key: Key,
    value: SignalSceneState["parameters"][Key],
  ) =>
    props.onChange({
      ...props.state,
      parameters: { ...props.state.parameters, [key]: value },
    });

  return (
    <div className="flex flex-col gap-5">
      <ToggleGroup
        aria-label="Signal mode"
        className="w-full bg-muted p-1"
        value={[props.state.parameters.mode]}
        onValueChange={(values) => {
          const mode = values[0];
          if (mode === "oscilloscope" || mode === "lissajous") {
            update("mode", mode);
          }
        }}
      >
        <ToggleGroupItem
          className={`flex-1 capitalize ${SELECTED_TOGGLE_CLASS}`}
          value="oscilloscope"
        >
          Oscilloscope
        </ToggleGroupItem>
        <ToggleGroupItem
          className={`flex-1 capitalize ${SELECTED_TOGGLE_CLASS}`}
          value="lissajous"
        >
          Lissajous
        </ToggleGroupItem>
      </ToggleGroup>

      <ParameterSlider
        label="Gain"
        value={props.state.parameters.gain}
        minimum={0.25}
        maximum={4}
        step={0.05}
        onChange={(value) => update("gain", value)}
      />
      <ParameterSlider
        label="Line width"
        value={props.state.parameters.lineWidth}
        minimum={0.5}
        maximum={6}
        step={0.1}
        onChange={(value) => update("lineWidth", value)}
      />
      <ParameterSlider
        label="Persistence"
        value={props.state.parameters.persistence}
        minimum={0}
        maximum={0.98}
        step={0.01}
        onChange={(value) => update("persistence", value)}
      />
      <ParameterSlider
        label="X frequency"
        value={props.state.parameters.xFrequency}
        minimum={1}
        maximum={8}
        step={1}
        onChange={(value) => update("xFrequency", value)}
      />
      <ParameterSlider
        label="Y frequency"
        value={props.state.parameters.yFrequency}
        minimum={1}
        maximum={8}
        step={1}
        onChange={(value) => update("yFrequency", value)}
      />
    </div>
  );
}

function LightMachineControls(props: {
  state: LightMachineSceneState;
  onChange: (state: LightMachineSceneState) => void;
}) {
  const update = <Key extends keyof LightMachineSceneState["parameters"]>(
    key: Key,
    value: LightMachineSceneState["parameters"][Key],
  ) =>
    props.onChange({
      ...props.state,
      parameters: { ...props.state.parameters, [key]: value },
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Symmetry</span>
        <ToggleGroup
          aria-label="Light-machine symmetry"
          className="w-full bg-muted p-1"
          value={[props.state.parameters.symmetry.toString()]}
          onValueChange={(values) => {
            const symmetry = LIGHT_MACHINE_SYMMETRIES.find(
              (candidate) => candidate.toString() === values[0],
            );
            if (symmetry) update("symmetry", symmetry);
          }}
        >
          {LIGHT_MACHINE_SYMMETRIES.map((symmetry) => (
            <ToggleGroupItem
              key={symmetry}
              className={`flex-1 ${SELECTED_TOGGLE_CLASS}`}
              value={symmetry.toString()}
            >
              {symmetry}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Palette</span>
        <ToggleGroup
          aria-label="Light-machine palette"
          className="w-full bg-muted p-1"
          value={[props.state.parameters.palette]}
          onValueChange={(values) => {
            const palette = LIGHT_MACHINE_PALETTES.find(
              (candidate) => candidate === values[0],
            );
            if (palette) update("palette", palette);
          }}
        >
          {LIGHT_MACHINE_PALETTES.map((palette) => (
            <ToggleGroupItem
              key={palette}
              className={`min-w-0 flex-1 capitalize ${SELECTED_TOGGLE_CLASS}`}
              value={palette}
            >
              {palette}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <ParameterSlider
        label="Feedback"
        value={props.state.parameters.feedback}
        minimum={0.5}
        maximum={0.97}
        step={0.01}
        onChange={(value) => update("feedback", value)}
      />
      <ParameterSlider
        label="Rotation"
        value={props.state.parameters.rotation}
        minimum={-180}
        maximum={180}
        step={1}
        suffix="°"
        onChange={(value) => update("rotation", value)}
      />
      <ParameterSlider
        label="Zoom"
        value={props.state.parameters.zoom}
        minimum={0.7}
        maximum={1.6}
        step={0.01}
        onChange={(value) => update("zoom", value)}
      />
      <ParameterSlider
        label="Color cycle"
        value={props.state.parameters.colorCycle}
        minimum={-1}
        maximum={1}
        step={0.01}
        onChange={(value) => update("colorCycle", value)}
      />
      <ParameterSlider
        label="Audio modulation"
        value={props.state.parameters.audioModulation}
        minimum={0}
        maximum={1}
        step={0.01}
        onChange={(value) => update("audioModulation", value)}
      />
      <ParameterSlider
        label="Intensity"
        value={props.state.parameters.intensity}
        minimum={0.4}
        maximum={2.4}
        step={0.05}
        onChange={(value) => update("intensity", value)}
      />
    </div>
  );
}

export function SceneControls(props: {
  session: BrowserVisualizationSession;
  presets: readonly ScenePreset[];
  busy: boolean;
  onSavePreset: (name: string) => Promise<void>;
}) {
  const [presetName, setPresetName] = useState("");
  const snapshot = useSyncExternalStore(
    (listener) => props.session.subscribe(listener),
    () => props.session.getSnapshot(),
  );
  const scene = snapshot.scene;
  const definition = BUILT_IN_SCENE_REGISTRY.get(scene.sceneId);

  return (
    <ScrollArea className="h-full">
      <section
        className="flex flex-col gap-7 px-4 py-5 sm:px-6"
        aria-label="Scene controls"
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium">Visualization scene</p>
            <p className="mt-1 text-[0.625rem] leading-4 text-muted-foreground">
              {definition.description}
            </p>
          </div>
          <ToggleGroup
            aria-label="Visualization scene"
            className="w-full bg-muted p-1"
            value={[scene.sceneId]}
            onValueChange={(values) => {
              const sceneId = values[0];
              if (sceneId) props.session.selectScene(sceneId);
            }}
          >
            <ToggleGroupItem
              className={`flex-1 ${SELECTED_TOGGLE_CLASS}`}
              value="signal"
            >
              Signal
            </ToggleGroupItem>
            <ToggleGroupItem
              className={`flex-1 ${SELECTED_TOGGLE_CLASS}`}
              value="light-machine"
            >
              Light machine
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {scene.sceneId === "signal" ? (
          <SignalControls
            state={scene}
            onChange={props.session.setState.bind(props.session)}
          />
        ) : (
          <LightMachineControls
            state={scene}
            onChange={props.session.setState.bind(props.session)}
          />
        )}

        <div className="flex flex-col gap-4 border-t border-border/70 pt-5">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor="scene-preset">Saved scene preset</Label>
              <select
                id="scene-preset"
                className="mt-2 h-8 w-full border border-input bg-input/20 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value=""
                onChange={(event) => {
                  const preset = props.presets.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (preset) props.session.loadPreset(preset);
                }}
              >
                <option value="">Choose a preset…</option>
                {props.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} ·{" "}
                    {preset.sceneId === "signal" ? "Signal" : "Light machine"}
                  </option>
                ))}
              </select>
            </div>
            {scene.sceneId === "light-machine" && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => props.session.vary()}
              >
                <ShuffleAngular data-icon="inline-start" aria-hidden />
                Vary
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label={`Reset ${definition.name} parameters`}
              onClick={() => props.session.reset()}
            >
              <ArrowCounterClockwise aria-hidden />
            </Button>
          </div>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void props.onSavePreset(presetName).then(
                () => setPresetName(""),
                () => undefined,
              );
            }}
          >
            <div className="min-w-0 flex-1">
              <Label htmlFor="preset-name">Preset name</Label>
              <Input
                id="preset-name"
                className="mt-2"
                value={presetName}
                maxLength={80}
                placeholder={
                  scene.sceneId === "signal" ? "Night trace" : "Prism engine"
                }
                disabled={props.busy}
                onChange={(event) => setPresetName(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              size="lg"
              disabled={props.busy || presetName.trim().length === 0}
            >
              <FloppyDisk data-icon="inline-start" aria-hidden />
              Save
            </Button>
          </form>
        </div>
      </section>
    </ScrollArea>
  );
}

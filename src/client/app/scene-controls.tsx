import { ArrowCounterClockwise, FloppyDisk } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { ScrollArea } from "@/client/components/ui/scroll-area";
import { Slider } from "@/client/components/ui/slider";
import { cn } from "@/client/lib/utils";
import {
  DEFAULT_SIGNAL_SCENE_PARAMETERS,
  type SignalSceneParameters,
  type SignalScenePreset,
} from "@/core/scene/signal-scene";

function ParameterSlider(props: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-3">
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
      </output>
    </div>
  );
}

export function SceneControls(props: {
  parameters: SignalSceneParameters;
  presets: readonly SignalScenePreset[];
  busy: boolean;
  onParametersChange: (parameters: SignalSceneParameters) => void;
  onSavePreset: (name: string) => Promise<void>;
}) {
  const [presetName, setPresetName] = useState("");

  const update = <Key extends keyof SignalSceneParameters>(
    key: Key,
    value: SignalSceneParameters[Key],
  ) => props.onParametersChange({ ...props.parameters, [key]: value });

  return (
    <ScrollArea className="h-full">
      <section
        className="space-y-7 px-4 py-5 sm:px-6"
        aria-label="Scene controls"
      >
        <div>
          <p className="text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">
            Signal instrument
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1 bg-muted p-1">
            {(["oscilloscope", "lissajous"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant="ghost"
                className={cn(
                  "capitalize",
                  props.parameters.mode === mode &&
                    "bg-background text-foreground shadow-xs",
                )}
                aria-pressed={props.parameters.mode === mode}
                onClick={() => update("mode", mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <ParameterSlider
            label="Gain"
            value={props.parameters.gain}
            minimum={0.25}
            maximum={4}
            step={0.05}
            onChange={(value) => update("gain", value)}
          />
          <ParameterSlider
            label="Line width"
            value={props.parameters.lineWidth}
            minimum={0.5}
            maximum={6}
            step={0.1}
            onChange={(value) => update("lineWidth", value)}
          />
          <ParameterSlider
            label="Persistence"
            value={props.parameters.persistence}
            minimum={0}
            maximum={0.98}
            step={0.01}
            onChange={(value) => update("persistence", value)}
          />
          <ParameterSlider
            label="X frequency"
            value={props.parameters.xFrequency}
            minimum={1}
            maximum={8}
            step={1}
            onChange={(value) => update("xFrequency", value)}
          />
          <ParameterSlider
            label="Y frequency"
            value={props.parameters.yFrequency}
            minimum={1}
            maximum={8}
            step={1}
            onChange={(value) => update("yFrequency", value)}
          />
        </div>

        <div className="border-t border-border/70 pt-5">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor="scene-preset">Saved preset</Label>
              <select
                id="scene-preset"
                className="mt-2 h-8 w-full border border-input bg-input/20 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value=""
                onChange={(event) => {
                  const preset = props.presets.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (preset) props.onParametersChange(preset.parameters);
                }}
              >
                <option value="">Choose a preset…</option>
                {props.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Reset scene parameters"
              onClick={() =>
                props.onParametersChange(DEFAULT_SIGNAL_SCENE_PARAMETERS)
              }
            >
              <ArrowCounterClockwise aria-hidden />
            </Button>
          </div>

          <form
            className="mt-4 flex items-end gap-2"
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
                placeholder="Night trace"
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

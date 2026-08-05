"use client";

import { useEffect, useRef } from "react";

import type { ControlSpec, DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface ControlsProps {
  spec: DemoSpecV1;
  /**
   * Prediction-first gate: simulation controls stay disabled until the
   * learner has submitted a prediction.
   */
  enabled: boolean;
  parameters: Record<string, number>;
  playing: boolean;
  speed: number;
  oneVariableMode: boolean;
  /** The control the learner last changed — the only one that stays live. */
  lockedControl: string | null;
  onParameterChange: (key: string, value: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (value: number) => void;
  onReset: () => void;
  onControlTouched: (controlId: string) => void;
  onOneVariableModeChange: (value: boolean) => void;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2];

/**
 * Renders spec.controls mapped onto the engine/animations/scene:
 *  - parameter target → engine parameter (setParam on the runner)
 *  - animation target → play/pause + speed (the runner drives all operators)
 *  - scene refs       → play/pause, speed, reset
 *
 * In one-variable mode every control except the learner's selected one is
 * frozen and labeled "Held constant". All controls honor the prediction gate.
 */
export function DemonstrationControls({
  spec,
  enabled,
  parameters,
  playing,
  speed,
  oneVariableMode,
  lockedControl,
  onParameterChange,
  onPlayPause,
  onSpeedChange,
  onReset,
  onControlTouched,
  onOneVariableModeChange,
}: ControlsProps) {
  const paramSpecs = new Map(
    (spec.simulation?.parameters ?? []).map((p) => [p.key, p])
  );

  const paramValue = (key: string) =>
    parameters[key] ?? paramSpecs.get(key)?.value ?? 0;

  const paramDefault = (key: string) => paramSpecs.get(key)?.value ?? 0;

  const paramUnit = (key: string) => paramSpecs.get(key)?.unit;

  const touch = (controlId: string) => {
    onControlTouched(controlId);
  };

  // Prediction-first handoff: when the gate unlocks (submitted), move focus
  // to the first interactive control. The submit button in the prediction
  // panel is replaced on submit, and the controls live earlier in the DOM —
  // this is the "predict → manipulate" step, so keyboard users land directly
  // on the next action instead of being dropped to <body>.
  const controlsRef = useRef<HTMLElement | null>(null);
  // The rows container holds ONLY the spec.controls rows (the one-variable
  // mode switch sits outside it, together with its focusable hidden input).
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const wasEnabledRef = useRef(enabled);
  useEffect(() => {
    if (enabled && !wasEnabledRef.current) {
      // Predict → manipulate handoff: focus the first experiment control
      // (slider / segment / play button), never the one-variable meta toggle.
      const first =
        rowsRef.current?.querySelector<HTMLElement>("input, button") ??
        controlsRef.current?.querySelector<HTMLElement>("[role='switch']");
      first?.focus();
    }
    wasEnabledRef.current = enabled;
  }, [enabled]);

  if (spec.controls.length === 0) {
    return (
      <section
        aria-label="Controls"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Controls
        </h2>
        <p className="mt-2 text-sm text-muted">
          This demonstration has no adjustable controls.
        </p>
      </section>
    );
  }

  return (
    <section
      ref={controlsRef}
      aria-label="Controls"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Controls
        </h2>
        {!enabled && (
          <p className="text-xs font-medium text-accent">
            Submit a prediction to unlock the controls
          </p>
        )}
      </div>

      {spec.adaptationContext.oneVariableMode && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-accent-soft/60 p-3">
          <div>
            <p className="text-sm font-medium">One-variable mode</p>
            <p className="text-xs leading-5 text-muted">
              Change one thing at a time; everything else stays frozen.
            </p>
          </div>
          <Switch
            checked={oneVariableMode}
            onCheckedChange={onOneVariableModeChange}
            aria-label="One-variable mode"
          />
        </div>
      )}

      <div ref={rowsRef} className="mt-4 flex flex-col gap-3">
        {spec.controls.map((control) => {
          const frozen =
            oneVariableMode &&
            lockedControl !== null &&
            lockedControl !== control.id;
          const disabled = !enabled || frozen;
          return (
            <ControlRow
              key={control.id}
              control={control}
              disabled={disabled}
              frozen={frozen}
              playing={playing}
              speed={speed}
              paramValue={paramValue}
              paramDefault={paramDefault}
              paramUnit={paramUnit}
              onTouch={() => touch(control.id)}
              onParameterChange={onParameterChange}
              onPlayPause={onPlayPause}
              onSpeedChange={onSpeedChange}
              onReset={onReset}
            />
          );
        })}
      </div>
    </section>
  );
}

function ControlRow({
  control,
  disabled,
  frozen,
  playing,
  speed,
  paramValue,
  paramDefault,
  paramUnit,
  onTouch,
  onParameterChange,
  onPlayPause,
  onSpeedChange,
  onReset,
}: {
  control: ControlSpec;
  disabled: boolean;
  frozen: boolean;
  playing: boolean;
  speed: number;
  paramValue: (key: string) => number;
  paramDefault: (key: string) => number;
  paramUnit: (key: string) => string | undefined;
  onTouch: () => void;
  onParameterChange: (key: string, value: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (value: number) => void;
  onReset: () => void;
}) {
  const { target } = control;

  const act = (fn: () => void) => {
    onTouch();
    fn();
  };

  let body: React.ReactNode = null;

  switch (control.type) {
    case "slider": {
      const min = control.min ?? 0;
      const max = control.max ?? 100;
      const step = control.step ?? 1;
      const ref = target.kind === "parameter" ? target.ref : control.id;
      const unit = target.kind === "parameter" ? paramUnit(target.ref) : undefined;
      body = (
        <Slider
          label={control.label}
          value={paramValue(ref)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          getAriaValueText={(formatted, value) =>
            unit ? `${value} ${unit}` : formatted
          }
          onValueChange={(value) =>
            act(() => {
              if (target.kind === "parameter") onParameterChange(target.ref, value);
            })
          }
        />
      );
      break;
    }
    case "toggle": {
      const checked =
        target.kind === "parameter"
          ? paramValue(target.ref) > 0.5
          : target.ref === "paused"
            ? !playing
            : playing;
      body = (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{control.label}</span>
          <Switch
            checked={checked}
            disabled={disabled}
            aria-label={control.label}
            onCheckedChange={(next) =>
              act(() => {
                if (target.kind === "parameter") {
                  onParameterChange(target.ref, next ? 1 : 0);
                } else {
                  onPlayPause();
                }
              })
            }
          />
        </div>
      );
      break;
    }
    case "segmented_control": {
      const ref = target.kind === "parameter" ? target.ref : control.id;
      const options = control.options ?? [];
      const selected = Math.round(paramValue(ref));
      body = (
        <div>
          <p className="text-sm font-medium">{control.label}</p>
          <div
            role="group"
            aria-label={control.label}
            className="mt-2 flex flex-wrap gap-1"
          >
            {options.map((option, index) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                aria-pressed={selected === index}
                onClick={() =>
                  act(() => {
                    if (target.kind === "parameter") {
                      onParameterChange(target.ref, index);
                    }
                  })
                }
                className={cn(
                  "min-h-11 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
                  selected === index
                    ? "bg-accent-strong text-white"
                    : "border border-border hover:bg-surface-raised"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      );
      break;
    }
    case "play_pause": {
      body = (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={playing}
          onClick={() => act(onPlayPause)}
          className="min-h-11 rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {playing ? "Pause" : "Play"}
        </button>
      );
      break;
    }
    case "speed_control": {
      body = (
        <div>
          <p className="text-sm font-medium">{control.label}</p>
          <div
            role="group"
            aria-label={control.label}
            className="mt-2 flex flex-wrap gap-1"
          >
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                aria-pressed={speed === option}
                onClick={() => act(() => onSpeedChange(option))}
                className={cn(
                  "min-h-11 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
                  speed === option
                    ? "bg-accent-strong text-white"
                    : "border border-border hover:bg-surface-raised"
                )}
              >
                {option}×
              </button>
            ))}
          </div>
        </div>
      );
      break;
    }
    case "button":
    case "reset": {
      body = (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            act(() => {
              if (target.kind === "scene" && target.ref === "reset") onReset();
              else if (target.kind === "scene" && target.ref === "play_pause") onPlayPause();
              else if (target.kind === "scene" && target.ref === "paused") onPlayPause();
              else if (target.kind === "parameter") {
                // Restore the declared default for this parameter.
                const defaultValue =
                  typeof control.defaultValue === "number"
                    ? control.defaultValue
                    : paramDefault(target.ref);
                onParameterChange(target.ref, defaultValue);
              }
            })
          }
          className="min-h-11 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          {control.label}
        </button>
      );
      break;
    }
    case "drag_handle": {
      // The canvas engines own pointer drags; a declared drag handle has no
      // separate DOM control — it is intentionally rendered as a note.
      body = (
        <p className="text-sm leading-6 text-muted">
          {control.label} — drag directly on the stage.
        </p>
      );
      break;
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface-raised p-3",
        frozen && "opacity-60"
      )}
    >
      {body}
      {frozen && (
        <p className="mt-1.5 text-xs font-medium text-muted">
          Held constant (one-variable mode)
        </p>
      )}
    </div>
  );
}

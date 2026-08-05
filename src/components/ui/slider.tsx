"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

/**
 * Slider — a labeled, keyboard-operable range input built on the base-ui
 * Slider primitive (the same library family as the Switch in this folder).
 *
 * The primitive renders a real <input type="range"> inside the thumb, so
 * arrow-key stepping, Home/End, PageUp/PageDown and a screen-reader-visible
 * value all work out of the box. The label is associated with the input
 * through base-ui's labelable context, and the current value is echoed in an
 * <output> element that reports value changes.
 */

function Slider({
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  format,
  getAriaValueText,
  onValueChange,
  className,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  format?: Intl.NumberFormatOptions;
  /** Override the announced value text (e.g. to include the unit). */
  getAriaValueText?: (formattedValue: string, value: number) => string;
  onValueChange: (value: number) => void;
  className?: string;
}) {
  return (
    <SliderPrimitive.Root
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      format={format}
      onValueChange={(next) => onValueChange(Number(next))}
      className={cn("flex w-full flex-col gap-1.5", className)}
    >
      {label ? (
        <SliderPrimitive.Label className="text-sm font-medium text-foreground">
          {label}
        </SliderPrimitive.Label>
      ) : null}
      <SliderPrimitive.Value className="font-mono text-sm text-muted" />
      <SliderPrimitive.Control className="relative flex h-11 w-full touch-none items-center">
        <SliderPrimitive.Track className="relative h-1.5 w-full rounded-full bg-input dark:bg-input/80">
          <SliderPrimitive.Indicator className="h-full rounded-full bg-accent-strong" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          getAriaLabel={(index) => (index === 0 && label ? label : "Value")}
          getAriaValueText={(formatted, val) =>
            getAriaValueText
              ? getAriaValueText(formatted, val)
              : formatted
          }
          className="size-5 rounded-full border border-border bg-background shadow-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };

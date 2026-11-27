import type { Slot } from "./types";

export function ChartPlot({ slots, ariaLabel }: { slots: Slot[]; ariaLabel: string }) {
  void slots;
  return <div className="h-[300px]" aria-label={ariaLabel} />;
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { stats } from "../../i18n/stats";
import { useT } from "../../lib/i18n";
import type { StatsFormatters } from "./model";
import type { Slot } from "./types";

const VOLUME = [
  { field: "dispatched", color: "var(--stats-dispatched)" },
  { field: "landed", color: "var(--stats-landed)" }
] as const;

const QUALITY = [
  { field: "acceptance_failed", color: "var(--stats-acceptance-failed)" },
  { field: "fable", color: "var(--stats-fable)" },
  { field: "reworks", color: "var(--stats-reworks)" },
  { field: "failed", color: "var(--stats-failed)" }
] as const;

const VOLUME_TOP = 22;
const VOLUME_HEIGHT = 140;
const VOLUME_BOTTOM = VOLUME_TOP + VOLUME_HEIGHT;
const QUALITY_TOP = VOLUME_BOTTOM + 26;
const QUALITY_HEIGHT = 100;
const QUALITY_BOTTOM = QUALITY_TOP + QUALITY_HEIGHT;
const CHART_HEIGHT = QUALITY_BOTTOM + 24;
const BAR_GAP = 2;
const TOOLTIP_GAP = 12;

function niceMaximum(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  if (value <= magnitude) return magnitude;
  if (value <= 2 * magnitude) return 2 * magnitude;
  if (value <= 5 * magnitude) return 5 * magnitude;
  return 10 * magnitude;
}

function barPath(x: number, bottom: number, width: number, height: number, topRadius: number) {
  const top = bottom - height;
  const right = x + width;
  const radius = Math.min(topRadius, width / 2, height);
  return `M ${x} ${bottom} V ${top + radius} Q ${x} ${top} ${x + radius} ${top}
    H ${right - radius} Q ${right} ${top} ${right} ${top + radius} V ${bottom} Z`;
}

export function ChartPlot({ slots, ariaLabel, format }: { slots: Slot[]; ariaLabel: string; format: StatsFormatters }) {
  const t = useT(stats);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const selectedIndex = slots.findIndex((slot) => slot.key === selectedKey);
  const hoverIndex = slots.findIndex((slot) => slot.key === hoverKey);
  if (selectedKey !== null && selectedIndex === -1) setSelectedKey(null);
  if (hoverKey !== null && hoverIndex === -1) setHoverKey(null);
  const activeIndex = hoverIndex === -1 ? selectedIndex : hoverIndex;
  const activeSlot = slots[activeIndex];
  const selectedSlot = slots[selectedIndex];
  const lastIndex = slots.length - 1;

  function selectWithKeyboard(event: KeyboardEvent<SVGSVGElement>) {
    let index: number;
    switch (event.key) {
      case "ArrowLeft":
        index = activeIndex === -1 ? lastIndex : Math.max(0, activeIndex - 1);
        break;
      case "ArrowRight":
        index = activeIndex === -1 ? lastIndex : Math.min(lastIndex, activeIndex + 1);
        break;
      case "Home":
        index = 0;
        break;
      case "End":
        index = lastIndex;
        break;
      case "Escape":
        if (activeIndex === -1) return;
        index = -1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    setHoverKey(null);
    setSelectedKey(index === -1 ? null : slots[index].key);
  }

  const volumeMax = niceMaximum(Math.max(...slots.map((slot) => Math.max(slot.dispatched, slot.landed))));
  const qualityTotals = slots.map((slot) => QUALITY.reduce((sum, { field }) => sum + slot[field], 0));
  const qualityMax = niceMaximum(Math.max(...qualityTotals));
  const panels = [
    { title: t("chart.volume"), top: VOLUME_TOP, bottom: VOLUME_BOTTOM, max: volumeMax },
    { title: t("chart.quality"), top: QUALITY_TOP, bottom: QUALITY_BOTTOM, max: qualityMax }
  ];

  const axisLabels = panels.map(({ max }) => format.number(max));
  const plotLeft = Math.max(36, ...axisLabels.map((label) => label.length * 7 + 8));
  const plotRight = width - 24;
  const slotWidth = Math.max(0, plotRight - plotLeft) / slots.length;
  const slotCenter = (index: number) => plotLeft + slotWidth * (index + 0.5);
  const barWidth = Math.max(2, Math.min(24, slotWidth * 0.7));
  const pairBarWidth = Math.max(2, (barWidth - BAR_GAP) / 2);

  const periodStep = slots.length > 14 ? 7 : slots.length > 8 ? 2 : 1;
  const labelStep = Math.max(periodStep, Math.ceil(48 / slotWidth));
  const labelIntervals = Math.floor(lastIndex / labelStep);
  const labelIndexes = labelIntervals === 0 ? [lastIndex] : Array.from(
    { length: labelIntervals + 1 }, (_, index) => Math.round(index * lastIndex / labelIntervals)
  );

  const activeX = slotCenter(activeIndex);
  const tooltipWidth = Math.min(220, width);
  const tooltipRight = activeX + TOOLTIP_GAP;
  const tooltipLeft = tooltipRight + tooltipWidth <= width
    ? tooltipRight
    : Math.max(0, activeX - TOOLTIP_GAP - tooltipWidth);
  const renderTooltip = (slot: Slot) => (
    <>
      <div className="mb-1 font-semibold">{slot.title}</div>
      {[...VOLUME, ...QUALITY].map(({ field, color }) => (
        <div className="flex items-baseline gap-1.5" key={field}>
          <span aria-hidden="true" className="relative -top-0.5 h-0.5 w-2.5 shrink-0" style={{ backgroundColor: color }} />
          <span><strong>{format.number(slot[field])}</strong>{" · "}{t(`series.${field}`)}</span>
        </div>
      ))}
      <div className="mt-1">{t("chart.tokens")}{": "}{format.tokens(slot.tokens)}</div>
      <div>{t("chart.credits")}{": "}{format.oneDecimal(slot.credits)}</div>
      <div>{t("dollars")}{" "}{format.twoDecimals(slot.usd)}</div>
    </>
  );

  return (
    <div ref={containerRef} className="relative mt-3 min-w-0">
      <svg className="block w-full focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
        height={CHART_HEIGHT} tabIndex={0} role="img" aria-label={ariaLabel} onKeyDown={selectWithKeyboard}>
        {slotWidth > 0 && <>
          {panels.map(({ title, top, bottom }, index) => (
            <g key={top}>
              <text x={plotLeft} y={top - 9} className="t-caption fill-current text-label-2">{title}</text>
              {[top, (top + bottom) / 2, bottom].map((y) => (
                <line key={y} x1={plotLeft} x2={plotRight} y1={y} y2={y}
                  stroke="var(--color-separator-soft)" strokeWidth={1} />
              ))}
              <g textAnchor="end" dominantBaseline="middle" className="tabular t-caption fill-current text-label-3">
                <text x={plotLeft - 6} y={top}>{axisLabels[index]}</text>
                <text x={plotLeft - 6} y={bottom}>{format.number(0)}</text>
              </g>
            </g>
          ))}
          {slots.map((slot, index) => {
            const x = slotCenter(index);
            const segments = QUALITY.filter(({ field }) => slot[field] > 0);
            const stackTotal = qualityTotals[index];
            const stackHeight = stackTotal / qualityMax * QUALITY_HEIGHT;
            // Reserve space for bars even when the whole stack is only a few pixels tall.
            const gap = Math.min(BAR_GAP, stackHeight / (2 * segments.length));
            const filledHeight = stackHeight - gap * (segments.length - 1);
            let baseline = QUALITY_BOTTOM;
            return (
              <g key={slot.key}>
                {VOLUME.map(({ field, color }, barIndex) => slot[field] > 0 && (
                  <path key={field} fill={color} d={barPath(
                    x - pairBarWidth - BAR_GAP / 2 + barIndex * (pairBarWidth + BAR_GAP),
                    VOLUME_BOTTOM, pairBarWidth, slot[field] / volumeMax * VOLUME_HEIGHT, 4
                  )} />
                ))}
                {segments.map(({ field, color }, segmentIndex) => {
                  const height = slot[field] / stackTotal * filledHeight;
                  const path = barPath(x - barWidth / 2, baseline, barWidth, height, segmentIndex === segments.length - 1 ? 4 : 0);
                  baseline -= height + gap;
                  return <path key={field} fill={color} d={path} />;
                })}
              </g>
            );
          })}
          {labelIndexes.map((index) => (
            <text key={slots[index].key} x={slotCenter(index)} y={CHART_HEIGHT - 6} textAnchor="middle"
              className="t-caption fill-current text-label-3">{slots[index].label}</text>
          ))}
          {activeSlot && <line x1={activeX} x2={activeX} y1={VOLUME_TOP} y2={QUALITY_BOTTOM}
            stroke="var(--color-separator)" strokeWidth={1} />}
          <g onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoverKey(null); }}>
            {slots.map((slot, index) => (
              <rect key={slot.key} x={plotLeft + slotWidth * index} y={VOLUME_TOP}
                width={slotWidth} height={QUALITY_BOTTOM - VOLUME_TOP} fill="transparent"
                onPointerMove={(event) => { if (event.pointerType === "mouse") setHoverKey(slot.key); }}
                onPointerUp={(event) => {
                  if (event.pointerType === "mouse") return;
                  setHoverKey(null);
                  setSelectedKey(slot.key);
                }} />
            ))}
          </g>
        </>}
      </svg>
      {activeSlot && slotWidth > 0 && (
        <div aria-hidden="true" className="inset shadow-panel t-footnote pointer-events-none absolute top-4 p-2.5 wrap-anywhere tabular"
          style={{ left: tooltipLeft, width: tooltipWidth }}>
          {renderTooltip(activeSlot)}
        </div>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{selectedSlot && renderTooltip(selectedSlot)}</div>
    </div>
  );
}

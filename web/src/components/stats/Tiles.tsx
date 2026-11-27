import type { tileValues } from "./model";

export function Tiles({ tiles }: { tiles: ReturnType<typeof tileValues> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 @[640px]:grid-cols-3 @[1000px]:grid-cols-6">
      {tiles.map(({ label, value, suffix, detail }) => (
        <div key={label} className="inset min-w-0 p-4 [overflow-wrap:anywhere]">
          <dt className="t-footnote text-label-2">{label}</dt>
          <dd className="t-title1 tabular">
            {value}{suffix && <span className="t-subhead font-normal text-label-2"> {suffix}</span>}
          </dd>
          {detail && <dd className="t-caption text-label-2">{detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

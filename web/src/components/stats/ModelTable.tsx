import { stats } from "../../i18n/stats";
import { useT } from "../../lib/i18n";
import { sortModels, type StatsFormatters } from "./model";
import type { StatsResponse } from "./types";

const COLUMNS = [
  "models.model", "models.tasks", "series.landed", "models.runs", "models.input",
  "models.cached", "models.output", "credits", "dollars"
] as const;

export function ModelTable({ byModel, format }: { byModel: StatsResponse["by_model"]; format: StatsFormatters }) {
  const t = useT(stats);
  const models = sortModels(byModel);
  return (
    <section className="inset p-4">
      <h2 className="t-headline">{t("models.title")}</h2>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("models.title")}>
        <table className="tabular mt-1.5 mb-3.5 w-full border-collapse text-sm whitespace-nowrap
          [&_tr>*]:border-b-[0.5px] [&_tr>*]:border-separator [&_tr>*]:px-2.5 [&_tr>*]:py-1.5
          [&_tr>*]:text-right [&_tr>*]:align-top [&_tr>:first-child]:text-left
          [&_th]:text-[13px] [&_th]:font-semibold [&_th]:text-label-2 [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              {COLUMNS.map((key) => <th key={key} scope="col">{t(key)}</th>)}
            </tr>
          </thead>
          <tbody>
            {models.map(([name, model]) => (
              <tr key={name}>
                <td>
                  <span className="mono">{name}</span>
                  {model.pricing === "unpriced" && <p className="t-caption text-label-2">{t("models.unpriced")}</p>}
                </td>
                <td>{format.number(model.tasks)}</td>
                <td>{format.number(model.landed)}</td>
                <td>{model.tasks === 0 ? "—" : format.oneDecimal(model.runs / model.tasks)}</td>
                <td>{format.tokens(model.input_tokens)}</td>
                <td>{format.tokens(model.cached_input_tokens)}</td>
                <td>{format.tokens(model.output_tokens)}</td>
                <td>{model.pricing === "codex" ? format.oneDecimal(model.credits) : "—"}</td>
                <td>{model.pricing === "deepseek" ? format.twoDecimals(model.usd) : "—"}</td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr><td colSpan={COLUMNS.length}>{t("models.empty")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { Select } from "@base-ui-components/react/select";
import { Check, Globe } from "@phosphor-icons/react";
import { common } from "../i18n/common";
import { LANG_NAMES, LANG_TRIGGER_ID, LANGS, useLang, useT, type Lang } from "../lib/i18n";

const ITEMS = LANGS.map((value) => ({ value, label: LANG_NAMES[value].full }));
const LANG_ATTR: Record<Lang, string> = { ru: "ru", en: "en", zh: "zh-CN" };

// Language is detected from the browser; this quiet control in the sidebar
// footer is the only way to correct it, so it stays visible but never loud.
export function LangSelect() {
  const t = useT(common);
  const { lang, setLang } = useLang();
  return (
    <Select.Root items={ITEMS} value={lang} onValueChange={(value) => setLang(value as Lang, { refocus: true })}>
      <Select.Trigger
        id={LANG_TRIGGER_ID}
        aria-label={t("lang.label")}
        className="t-caption -my-1 flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-label-2 outline-none transition-colors duration-150 hover:bg-fill focus-visible:ring-2 focus-visible:ring-blue data-[popup-open]:bg-fill"
      >
        <Globe size={14} aria-hidden />
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="top" align="end" sideOffset={6} alignItemWithTrigger={false} collisionPadding={12} className="z-50">
          <Select.Popup className="min-w-[160px] rounded-xl bg-bg-2 p-1 shadow-panel outline-none">
            {ITEMS.map((item) => (
              <Select.Item
                key={item.value}
                value={item.value}
                lang={LANG_ATTR[item.value]}
                className="t-subhead grid min-h-[36px] cursor-default grid-cols-[16px_1fr] items-center gap-2 rounded-lg px-2 text-label outline-none data-[highlighted]:bg-fill"
              >
                <Select.ItemIndicator className="col-start-1 text-blue">
                  <Check size={14} weight="bold" aria-hidden />
                </Select.ItemIndicator>
                <Select.ItemText className="col-start-2">{item.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}


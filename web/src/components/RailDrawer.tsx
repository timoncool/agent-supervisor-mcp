import type { ReactNode } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { List } from "@phosphor-icons/react";
import { common } from "../i18n/common";
import { useT } from "../lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inert: boolean;
  children: ReactNode;
}

export function RailDrawer({ open, onOpenChange, inert, children }: Props) {
  const t = useT(common);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <header className="flex h-12 items-center border-b border-separator-soft px-4" inert={inert}>
        <Dialog.Trigger className="t-subhead flex min-h-11 min-w-11 items-center gap-2 rounded-lg px-2 outline-none ring-blue hover:bg-fill focus-visible:ring-2">
          <List size={20} aria-hidden />
          {t("nav.menu")}
        </Dialog.Trigger>
      </header>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup aria-label={t("rail.title")} className="fixed inset-y-0 left-0 z-50 w-[min(280px,calc(100vw_-_56px))] outline-none transition-transform duration-200 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full">
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { settingsT, type SettingsLocale } from "./settings-i18n";

export function describeScreenAwarenessNotice(
  state: Pick<DesktopRendererState, "screenAwarenessNotice">,
  locale?: SettingsLocale
): string {
  if (!state.screenAwarenessNotice) {
    return "";
  }
  return settingsT(locale, "chat.screenAwareness.visionMissingNotice");
}

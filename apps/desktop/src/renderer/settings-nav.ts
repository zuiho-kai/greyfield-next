export type SettingsSectionId = "model" | "voice" | "window" | "persona" | "provider" | "memory";

export const settingsNavSectionIds: SettingsSectionId[] = ["model", "voice", "window", "persona", "provider", "memory"];

export interface SettingsSectionMeasurement {
  id: SettingsSectionId;
  top: number;
}

export function resolveActiveSettingsSection(
  sections: SettingsSectionMeasurement[],
  viewportTop: number
): SettingsSectionId | null {
  if (sections.length === 0) {
    return null;
  }

  let closest = sections[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const section of sections) {
    const distance = Math.abs(section.top - viewportTop);
    if (distance < closestDistance) {
      closest = section;
      closestDistance = distance;
    }
  }
  return closest.id;
}

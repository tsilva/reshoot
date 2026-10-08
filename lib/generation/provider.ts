import "server-only";

export const supportedImageModels = [
  "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2.5-sunburst",
] as const;

export function selectImageModel(override = process.env.RESHOOT_IMAGE_MODEL) {
  const model = override || supportedImageModels[0];
  if (!supportedImageModels.some((supported) => supported === model)) {
    throw new Error("The configured image model is not supported.");
  }
  return model;
}

export const imageProviderConfig = {
  endpoint: "https://openrouter.ai/api/v1/images",
  model: selectImageModel(),
  referer: "https://reshoot.tsilva.eu",
  title: "Reshoot",
} as const;

export function requireImageProviderKey() {
  const key =
    process.env.OPENROUTER_API_KEY ?? process.env.IMAGE_GENERATION_API_KEY;
  if (!key) throw new Error("Image provider credentials are not configured.");
  return key;
}

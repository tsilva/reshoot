import "server-only";

export const imageProviderConfig = {
  endpoint: "https://openrouter.ai/api/v1/images",
  model: "openai/gpt-image-2",
  referer: "https://reshoot.tsilva.eu",
  title: "Reshoot",
} as const;

export function requireImageProviderKey() {
  const key =
    process.env.IMAGE_GENERATION_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Image provider credentials are not configured.");
  return key;
}

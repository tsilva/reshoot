export function demoCheckoutEnabledForEnvironment(input: {
  isDemoUser: boolean;
  nodeEnv?: string;
  vercelEnv?: string;
}) {
  if (!input.isDemoUser) return false;
  if (input.vercelEnv === "production") return false;
  return (
    input.vercelEnv === undefined ||
    input.vercelEnv === "development" ||
    input.vercelEnv === "preview" ||
    input.nodeEnv !== "production"
  );
}

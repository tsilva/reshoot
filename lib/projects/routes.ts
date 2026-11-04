export const PROJECT_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const PROJECT_RETURN_KEY = "reshoot:return-to-project";

export function projectPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function projectCardId(projectId: string) {
  return `shoot-${projectId}`;
}

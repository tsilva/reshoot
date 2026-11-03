export const PROJECT_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function projectPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`;
}

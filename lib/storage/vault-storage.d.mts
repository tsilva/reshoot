export const STORAGE_PLACEHOLDER: string;
export function validateStorageSession(env?: Record<string, string | undefined>): string;
export function createVaultStorage(env?: Record<string, string | undefined>): {
  check(): Promise<{ok: boolean; isolated: boolean; credential_mode: string}>;
  signUpload(input: {key: string; mimeType: string; checksumSha256: string; expiresIn?: number}): Promise<{url: string; headers: {'Content-Type': string}}>;
  signRead(key: string, expiresIn?: number): Promise<string>;
  headObject(key: string): Promise<{ContentLength: number; ContentType: string; Metadata?: Record<string, string>}>;
  getObjectBuffer(key: string): Promise<Buffer>;
  getObjectStream(key: string): Promise<ReadableStream<Uint8Array>>;
  putObject(input: {key: string; body: Uint8Array; mimeType: string; checksumSha256?: string}): Promise<string>;
  deleteObject(key: string): Promise<void>;
};

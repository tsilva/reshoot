import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { createVaultStorage } from "./vault-storage.mjs";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

const localStorage = process.env.RESHOOT_STORAGE_TRANSPORT !== undefined
  ? createVaultStorage() : undefined;
const bucket = localStorage ? undefined : requiredEnv("R2_BUCKET_NAME");

const globalForR2 = globalThis as unknown as { reshootR2?: S3Client };

export const r2 =
  localStorage ? undefined : globalForR2.reshootR2 ??
  new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

if (!localStorage && process.env.NODE_ENV !== "production") globalForR2.reshootR2 = r2;

function legacyClient() {
  if (!r2) throw new Error("R2 is unavailable in the isolated local storage mode.");
  return r2;
}

export function sha256Hex(buffer: Uint8Array) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256Base64FromHex(checksum: string) {
  return Buffer.from(checksum, "hex").toString("base64");
}

export async function signUpload(input: {
  key: string;
  mimeType: string;
  checksumSha256: string;
  expiresIn?: number;
}) {
  if (localStorage) return localStorage.signUpload(input);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.mimeType,
    Metadata: { sha256: input.checksumSha256 },
  });

  return {
    url: await getSignedUrl(legacyClient(), command, { expiresIn: input.expiresIn ?? 600 }),
    headers: {
      "Content-Type": input.mimeType,
    },
  };
}

export async function signRead(key: string, expiresIn = 600) {
  if (localStorage) return localStorage.signRead(key, expiresIn);
  return getSignedUrl(
    legacyClient(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

export async function headObject(key: string) {
  if (localStorage) return localStorage.headObject(key);
  return legacyClient().send(
    new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: "ENABLED" }),
  );
}

async function getObjectBody(key: string) {
  const response = await legacyClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: "ENABLED" }),
  );
  if (!response.Body) throw new Error("Stored object has no body.");
  return response.Body;
}

export async function getObjectBuffer(key: string) {
  if (localStorage) return localStorage.getObjectBuffer(key);
  const body = await getObjectBody(key);
  return Buffer.from(await body.transformToByteArray());
}

export async function getObjectStream(key: string) {
  if (localStorage) return localStorage.getObjectStream(key);
  const body = await getObjectBody(key);
  return body.transformToWebStream();
}

export async function putObject(input: {
  key: string;
  body: Uint8Array;
  mimeType: string;
  checksumSha256?: string;
}) {
  if (localStorage) return localStorage.putObject(input);
  const checksum = input.checksumSha256 ?? sha256Hex(input.body);
  await legacyClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.mimeType,
      ChecksumSHA256: sha256Base64FromHex(checksum),
      Metadata: { sha256: checksum },
    }),
  );
  return checksum;
}

export async function deleteObject(key: string) {
  if (localStorage) return localStorage.deleteObject(key);
  await legacyClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

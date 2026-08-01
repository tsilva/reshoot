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

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

const bucket = requiredEnv("R2_BUCKET_NAME");

const globalForR2 = globalThis as unknown as { reshootR2?: S3Client };

export const r2 =
  globalForR2.reshootR2 ??
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

if (process.env.NODE_ENV !== "production") globalForR2.reshootR2 = r2;

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
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.mimeType,
    Metadata: { sha256: input.checksumSha256 },
  });

  return {
    url: await getSignedUrl(r2, command, { expiresIn: input.expiresIn ?? 600 }),
    headers: {
      "Content-Type": input.mimeType,
    },
  };
}

export async function signRead(key: string, expiresIn = 600) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

export async function headObject(key: string) {
  return r2.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: "ENABLED" }),
  );
}

export async function getObjectBuffer(key: string) {
  const response = await r2.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: "ENABLED" }),
  );
  if (!response.Body) throw new Error("Stored object has no body.");
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function putObject(input: {
  key: string;
  body: Uint8Array;
  mimeType: string;
  checksumSha256?: string;
}) {
  const checksum = input.checksumSha256 ?? sha256Hex(input.body);
  await r2.send(
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
  await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

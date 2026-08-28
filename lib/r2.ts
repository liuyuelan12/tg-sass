import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";

function getR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const bucket = () => process.env.R2_BUCKET_NAME!;

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Buffers a whole object into memory. Fine for CSV text, wrong for attachments.
 *
 * Buffers live in native memory *outside* the V8 heap, so `--max-old-space-size`
 * does not cap them — buffering attachments in a loop is how this process reached
 * ~1.9 GB resident against a 512 MB heap limit. Use `streamFromR2` for anything
 * that is only being passed through.
 */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket(), Key: key })
  );
  const stream = response.Body;
  if (!stream) throw new Error("Empty response from R2");
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Opens an object as a stream so callers can pipe it without ever holding it whole.
 */
export async function streamFromR2(key: string): Promise<Readable> {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket(), Key: key })
  );
  const body = response.Body;
  if (!body) throw new Error("Empty response from R2");
  return body as Readable;
}

/**
 * Signs a direct-download link.
 *
 * `filename` is worth passing: without a Content-Disposition the browser renders
 * CSVs inline instead of saving them, and the object key — not the friendly name —
 * ends up as the filename.
 */
export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
  filename?: string
): Promise<string> {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(filename
        ? { ResponseContentDisposition: `attachment; filename="${filename}"` }
        : {}),
    }),
    { expiresIn }
  );
}

export async function listR2Objects(prefix: string): Promise<string[]> {
  const client = getR2Client();
  const response = await client.send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix })
  );
  return (response.Contents || []).map((obj) => obj.Key!).filter(Boolean);
}

export async function deleteR2Prefix(prefix: string): Promise<void> {
  const keys = await listR2Objects(prefix);
  if (keys.length === 0) return;
  const client = getR2Client();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
}

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const attachmentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type AttachmentType = (typeof attachmentTypes)[number];
export const MAX_ATTACHMENT_BYTES = 10_000_000;

function config() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_BUCKET_NAME;
  if (!region || !bucket)
    throw new Error(
      "Attachments are not configured. Add AWS_REGION and S3_BUCKET_NAME in Settings > Environment Variables.",
    );
  return {
    region,
    bucket,
    prefix: (process.env.S3_ATTACHMENTS_PREFIX || "carnot/attachments").replace(
      /^\/+|\/+$/g,
      "",
    ),
    ttl: Math.min(
      900,
      Math.max(60, Number(process.env.S3_PRESIGNED_URL_TTL_SECONDS || 300)),
    ),
  };
}

function client(region: string) {
  return new S3Client({ region });
}

export function safeFileName(value: string) {
  const safe = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return safe || "attachment";
}

export async function presignAttachmentUpload(input: {
  attachmentId: string;
  entityId: string;
  fileName: string;
  contentType: AttachmentType;
}) {
  const { region, bucket, prefix, ttl } = config();
  const s3Key = `${prefix}/fabric-orders/${input.entityId}/${input.attachmentId}/${safeFileName(input.fileName)}`;
  const uploadUrl = await getSignedUrl(
    client(region),
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: input.contentType,
    }),
    { expiresIn: ttl },
  );
  return { uploadUrl, s3Key, expiresIn: ttl };
}

export async function presignAttachmentDownload(s3Key: string) {
  const { region, bucket, prefix, ttl } = config();
  if (!s3Key.startsWith(`${prefix}/`))
    throw new Error("Invalid attachment key");
  return getSignedUrl(
    client(region),
    new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
    { expiresIn: ttl },
  );
}

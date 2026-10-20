import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

/**
 * Creates the two buckets on a local S3 server (RustFS) and makes the public one anonymously
 * readable, mimicking the R2 custom domain. Local development, CI and tests only — R2 buckets,
 * public access and lifecycle rules are set up in the Cloudflare dashboard (docs/deployment/r2.md).
 */
export async function ensureLocalBuckets(
  client: S3Client,
  buckets: { privateBucket: string; publicBucket: string },
): Promise<void> {
  for (const bucket of [buckets.privateBucket, buckets.publicBucket]) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: buckets.publicBucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${buckets.publicBucket}/*`],
          },
        ],
      }),
    }),
  );
}

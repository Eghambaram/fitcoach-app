import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";
import { ensureLocalBuckets } from "../integrations/storage/local-buckets";
import { createS3Client } from "../integrations/storage/storage.service";

export interface TestStorage {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    storage: TestStorage;
  }
}

/** Same RustFS image as docker-compose (ADR-0036): the API tests exercise real S3 calls. */
const RUSTFS_IMAGE = "rustfs/rustfs:1.0.3";

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const accessKeyId = "testaccesskey";
  const secretAccessKey = "testsecretkey";
  const container = await new GenericContainer(RUSTFS_IMAGE)
    .withEnvironment({
      RUSTFS_ACCESS_KEY: accessKeyId,
      RUSTFS_SECRET_KEY: secretAccessKey,
      RUSTFS_ADDRESS: ":9000",
      RUSTFS_CONSOLE_ENABLE: "false",
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const storage: TestStorage = {
    endpoint: `http://${container.getHost()}:${container.getMappedPort(9000)}`,
    accessKeyId,
    secretAccessKey,
    privateBucket: "fitcoach-test-private",
    publicBucket: "fitcoach-test-public",
  };

  const client = createS3Client({
    ...storage,
    region: "us-east-1",
    publicBaseUrl: "",
    keyPrefix: "",
    budgetBytes: 1,
    hardLimitBytes: 2,
  });
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureLocalBuckets(client, storage);
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  client.destroy();

  project.provide("storage", storage);
  return async () => {
    await container.stop();
  };
}

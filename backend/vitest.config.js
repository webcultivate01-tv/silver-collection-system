import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

// .env.test first, then .env for anything it doesn't set (DB_PASSWORD, which
// is this machine's and doesn't belong in a committed file). dotenv never
// overwrites a variable that is already set, so the order here is what makes
// .env.test win.
loadEnv({ path: ".env.test" });
loadEnv({ path: ".env" });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Every suite shares one MySQL schema and truncates between tests, so they
    // must never run at the same time - fileParallelism: false is what makes
    // the integration tests reliable rather than flaky.
    //
    // singleFork stays OFF deliberately. All the files sharing one fork would
    // also mean sharing one module registry, and config/db.js builds its pool
    // at import time: the first suite's afterAll(closePool) would then close
    // the pool out from under every suite after it. A fork per file, run one
    // at a time, gives each suite its own pool and still no concurrency.
    fileParallelism: false,
    pool: "forks",
    globalSetup: ["./tests/setup/globalSetup.js"],
    setupFiles: ["./tests/setup/setupFile.js"],
    // The concurrency tests fire dozens of real queries; the default 5s is
    // tight on a cold connection pool.
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DB_NAME: process.env.DB_NAME,
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
      SMTP_USER: "",
      SMTP_PASSWORD: "",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // What the suite is actually aiming at. Config, seeders and the entry
      // point are excluded because testing them proves nothing.
      include: ["controllers/**", "models/**", "middleware/**", "utils/**", "app.js"],
      exclude: ["seeder/**", "scripts/**", "config/**", "server.js"],
    },
  },
});

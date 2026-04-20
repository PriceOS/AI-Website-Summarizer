import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");

if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

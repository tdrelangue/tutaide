import { randomBytes } from "node:crypto";

// A throwaway key: test data is encrypted like real data, never with the real key.
process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");

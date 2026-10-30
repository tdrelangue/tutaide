// Run: npx tsx scripts/tests/db-retry.test.ts
import assert from "node:assert/strict";
import { withPoolLimits } from "../../src/lib/db-pool";
import { isConnectionError, withConnectionRetry } from "../../src/lib/db-retry";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

const noWait = async () => {};
const prismaError = (code: string) => Object.assign(new Error(code), { code });

async function main() {
  await check("connection errors are recognised, query errors are not", () => {
    assert.equal(isConnectionError(prismaError("P2037")), true);
    assert.equal(isConnectionError(Object.assign(new Error("init"), { errorCode: "P1001" })), true);
    assert.equal(isConnectionError(prismaError("P2002")), false, "unique constraint: the query ran");
    assert.equal(isConnectionError(new Error("plain")), false);
    assert.equal(isConnectionError(null), false);
  });

  await check("a burst of « too many connections » is absorbed", async () => {
    let calls = 0;
    const result = await withConnectionRetry(async () => {
      calls++;
      if (calls < 3) throw prismaError("P2037");
      return "ok";
    }, [1, 1, 1, 1], noWait);
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  await check("waits longer at each attempt, then gives up with the original error", async () => {
    const waits: number[] = [];
    let calls = 0;
    const failing = withConnectionRetry(async () => {
      calls++;
      throw prismaError("P1001");
    }, [250, 500, 1000], async (ms) => { waits.push(ms); });
    await assert.rejects(failing, /P1001/);
    assert.deepEqual(waits, [250, 500, 1000]);
    assert.equal(calls, 4, "first try + one per delay");
  });

  await check("any other error is thrown at once (a write is never replayed)", async () => {
    let calls = 0;
    await assert.rejects(
      withConnectionRetry(async () => {
        calls++;
        throw prismaError("P2002");
      }, [1, 1], noWait),
      /P2002/,
    );
    assert.equal(calls, 1);
  });

  await check("each copy keeps at most 2 connections, without overriding the address", () => {
    assert.equal(withPoolLimits("postgres://u:p@h:5432/db?sslmode=require"), "postgres://u:p@h:5432/db?sslmode=require&connection_limit=2&pool_timeout=15");
    assert.equal(withPoolLimits("postgresql://u:p@h/db"), "postgresql://u:p@h/db?connection_limit=2&pool_timeout=15");
    assert.equal(withPoolLimits("postgres://h/db?connection_limit=7"), "postgres://h/db?connection_limit=7&pool_timeout=15");
    assert.equal(withPoolLimits("prisma+postgres://x/?api_key=k"), "prisma+postgres://x/?api_key=k", "other schemes untouched");
    assert.equal(withPoolLimits(undefined), undefined);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

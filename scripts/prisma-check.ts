import { db } from "../src/lib/db";
async function main() {
  const rows = await (db as any).provider?.findMany?.();
  console.log("provider model exists:", !!rows, "rows:", JSON.stringify(rows));
}
main().catch(console.error);

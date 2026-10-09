import { readFileSync } from "node:fs";

// pnpmをmise/CIに任せるpmOnFail:ignoreでも、版違いのinstallを許さない。
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const expectedPnpm = manifest.packageManager.slice("pnpm@".length);
const mise = readFileSync(new URL("../mise.toml", import.meta.url), "utf8");
const expectedNode = mise.match(/^node = "([^"]+)"$/m)?.[1];
const actualPnpm = process.env.npm_config_user_agent?.split(" ")[0];
if (actualPnpm !== `pnpm/${expectedPnpm}` || process.versions.node !== expectedNode) {
  console.error(`実行環境: Node ${process.versions.node} / ${actualPnpm ?? "unknown"}。Node ${expectedNode} / pnpm ${expectedPnpm} が必要です。mise trust && mise install を実行してください。`);
  process.exitCode = 1;
}

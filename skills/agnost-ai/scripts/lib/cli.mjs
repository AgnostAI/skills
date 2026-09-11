export const NO_ORG_ID = "no org id. Pass --org-id or set AGNOST_ORG_ID; do not invent one.";

export function printHelpAndExit(usage) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage.trim());
    process.exit(0);
  }
}

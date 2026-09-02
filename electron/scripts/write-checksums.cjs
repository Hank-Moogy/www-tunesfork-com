#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const releaseDir = path.join(__dirname, "..", "release");
const assets = fs.existsSync(releaseDir)
  ? fs.readdirSync(releaseDir).filter((name) => /\.(dmg|exe)$/i.test(name)).sort()
  : [];
if (assets.length === 0) throw new Error("No DMG or EXE release assets found");
const lines = assets.map((name) => {
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(releaseDir, name))).digest("hex");
  return `${sha256}  ${name}`;
});
fs.writeFileSync(path.join(releaseDir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));

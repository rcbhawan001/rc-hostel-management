/**
 * Builds a 16:9 hero from the lobby master.
 *
 * - Reads: public/branding/auth-lobby-bg.source.png (your full-resolution master)
 * - Writes: public/branding/auth-lobby-bg-hero.png
 *
 * Run: npm run prep-auth-bg
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "public/branding");
const source = path.join(dir, "auth-lobby-bg.source.png");
const output = path.join(dir, "auth-lobby-bg-hero.png");

if (!fs.existsSync(source)) {
  console.error("Missing master image:", source);
  console.error("Add your lobby PNG as auth-lobby-bg.source.png, then run again.");
  process.exit(1);
}

const meta = await sharp(source).metadata();
console.log("Master:", meta.width, "x", meta.height);

const OUT_W = 2560;
const OUT_H = 1440;
const tmp = path.join(os.tmpdir(), `auth-lobby-hero-${Date.now()}.png`);

await sharp(source)
  .resize(OUT_W, OUT_H, {
    fit: "cover",
    position: "west",
  })
  .png({ compressionLevel: 9, effort: 7 })
  .toFile(tmp);

fs.copyFileSync(tmp, output);
fs.unlinkSync(tmp);

console.log("Wrote", OUT_W, "x", OUT_H, "→ public/branding/auth-lobby-bg-hero.png");

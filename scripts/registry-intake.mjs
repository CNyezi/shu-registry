import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isLikelyUrl(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("plugin.json must be an object");
  for (const key of ["id", "name", "version", "description"]) {
    if (typeof manifest[key] !== "string" || manifest[key].trim() === "") {
      throw new Error(`plugin.json missing ${key}`);
    }
  }
  if (!Array.isArray(manifest.permissions) || !manifest.permissions.every((p) => typeof p === "string")) {
    throw new Error("plugin.json permissions must be a string array");
  }
}

async function readPackageBytes(source) {
  if (isLikelyUrl(source)) {
    if (!isHttpUrl(source)) throw new Error("only http/https package URLs are allowed");
    const response = await fetch(source);
    if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(source);
}

async function readPackageManifest(packagePath) {
  try {
    const text = execFileSync("unzip", ["-p", packagePath, "plugin.json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`failed to read plugin.json: ${error.message}`);
  }
}

async function createRegistryEntry(source) {
  const bytes = await readPackageBytes(source);
  const dir = await mkdtemp(join(tmpdir(), "shu-intake-"));
  const packagePath = join(dir, basename(source) || "plugin.pcp");
  try {
    await writeFile(packagePath, bytes);
    const manifest = await readPackageManifest(packagePath);
    assertManifest(manifest);
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      permissions: manifest.permissions,
      packageUrl: source,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function updateRegistry(registryPath, entry) {
  let registry = { version: 1, plugins: [] };
  try {
    registry = JSON.parse(await readFile(registryPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (registry.version !== 1 || !Array.isArray(registry.plugins)) {
    throw new Error("registry.json must contain { version: 1, plugins: [] }");
  }

  const existing = registry.plugins.find((p) => p.id === entry.id && p.version === entry.version);
  if (existing && existing.packageUrl !== entry.packageUrl) {
    throw new Error(`duplicate plugin version: ${entry.id}@${entry.version}`);
  }
  registry.plugins = registry.plugins.filter((p) => !(p.id === entry.id && p.version === entry.version));
  registry.plugins.push(entry);
  registry.plugins.sort((a, b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`));
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

async function main(argv) {
  const [source, registryPath = "registry.json"] = argv;
  if (!source) {
    console.error("Usage: node scripts/registry-intake.mjs <package-url-or-file> [registry-json]");
    process.exitCode = 1;
    return;
  }
  const entry = await createRegistryEntry(source);
  await updateRegistry(registryPath, entry);
  console.log(JSON.stringify(entry, null, 2));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

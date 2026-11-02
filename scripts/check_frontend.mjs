import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const javascriptRoot = path.join(projectRoot, "webgis", "static", "webgis", "js");

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

const files = collectJavaScriptFiles(javascriptRoot).sort();
if (files.length === 0) {
  throw new Error("No JavaScript files were found in the static directory.");
}

for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");
  new vm.Script(source, { filename: path.relative(projectRoot, filePath) });
  console.log(`Syntax OK: ${path.relative(projectRoot, filePath)}`);
}

console.log(`Validated ${files.length} JavaScript files.`);

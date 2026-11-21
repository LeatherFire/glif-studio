import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");
let html = await read("index.html");
let css = await read("src/studio.css");
for (const [reference, file] of css.matchAll(
  /url\(\.\.\/(assets\/[\w-]+\.woff2)\)/g,
)) {
  const bytes = await readFile(new URL(file, root));
  css = css.replace(
    reference,
    () => "url(data:font/woff2;base64," + bytes.toString("base64") + ")",
  );
}
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="src\/studio\.css"\s*\/?\s*>/,
  () => "<style>" + css + "</style>",
);
for (const [tag, file] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const source = await read(file);
  html = html.replace(
    tag,
    () =>
      "<script>" + source.replace(/<\/script/gi, "<\\/script") + "</script>",
  );
}
const license = await read("licenses/Geist.txt");
html = html.replace(
  "</body>",
  () =>
    "<!-- Embedded typeface license\n" +
    license.replaceAll("--", "—") +
    "\n-->\n</body>",
);
const out = new URL("dist/Glif-Studio.html", root);
await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(out, html);
console.log(fileURLToPath(out));

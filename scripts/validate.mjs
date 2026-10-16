// Validates atlas files against the JSON Schema:
//   npm install --no-save ajv@8 ajv-formats@3 && node scripts/validate.mjs examples
// YAML is read the way stackatlas reads it (YAML 1.2 core schema), so dates
// like 2027-01-31 stay strings.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parseYaml } from "../web/atlas.js";

const schema = JSON.parse(readFileSync(new URL("../schema/stackatlas.schema.json", import.meta.url)));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const files = (path) => statSync(path).isDirectory()
  ? readdirSync(path).flatMap((name) => files(join(path, name)))
  : /\.ya?ml$/i.test(path) ? [path] : [];

let failed = false;
for (const file of process.argv.slice(2).flatMap(files)) {
  const doc = parseYaml(readFileSync(file, "utf8"));
  if (validate(doc)) {
    console.log(`ok      ${file}`);
  } else {
    failed = true;
    console.log(`invalid ${file}`);
    for (const e of validate.errors) console.log(`        ${e.instancePath || "/"} ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);

import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

await Promise.all([
  rm("./dist", { force: true, recursive: true }),
  rm("./client", { force: true, recursive: true }),
]);

const output = await Bun.build({
  entrypoints: ["./src/server/main.ts"],
  minify: true,
  naming: {
    asset: "[name]-[hash].[ext]",
    chunk: "[name]-[hash].[ext]",
    entry: "[name].[ext]",
  },
  outdir: "./dist",
  plugins: [tailwind],
  root: "./src",
  target: "bun",
});

if (!output.success) {
  for (const message of output.logs) {
    console.error(message);
  }

  throw new Error("Wave Player Next production build failed.");
}

for (const artifact of output.outputs) {
  console.log(`${artifact.kind}: ${artifact.path}`);
}

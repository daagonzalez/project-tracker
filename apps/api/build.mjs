// Bundles the server and the create-user CLI into dist/. @tracker/shared ships as TypeScript source,
// so it is inlined; every other package stays external and is installed in the runtime image.
import { build } from "esbuild";

const externalExceptShared = {
  name: "external-except-shared",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path === "@tracker/shared" || args.path.startsWith("@tracker/shared/")) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await build({
  entryPoints: { server: "src/server.ts", "cli/create-user": "src/cli/create-user.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  plugins: [externalExceptShared],
});

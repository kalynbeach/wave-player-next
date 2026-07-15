import appHtml from "../client/index.html";

const port = Number.parseInt(Bun.env.PORT ?? "3000", 10);

const server = Bun.serve({
  hostname: "localhost",
  port,
  development:
    Bun.env.NODE_ENV === "production"
      ? false
      : {
          console: true,
          hmr: true,
        },
  routes: {
    "/": appHtml,
  },
});

console.log(`Wave Player Next listening at ${server.url}`);

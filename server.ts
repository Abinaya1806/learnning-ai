import cookieParser from "cookie-parser";
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { attachLiveVoiceWebSocket } from "./server/live.ts";
import { mediaRouter } from "./server/mediaRoutes.ts";
import { apiRouter } from "./server/routes.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "8mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "LearnMate AI" });
  });

  app.use("/api/media", mediaRouter);
  app.use("/api", apiRouter);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexHtml = path.join(distDir, "index.html");
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send("Build artifacts not found. Run npm run build first.");
      }
    });
  }

  const httpServer = http.createServer(app);
  httpServer.requestTimeout = 360000;
  attachLiveVoiceWebSocket(httpServer);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`LearnMate AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start LearnMate AI server:", err);
  process.exit(1);
});

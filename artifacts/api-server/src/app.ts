import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import fs from "node:fs";

app.use("/api", router);

export async function setupFrontend(appInstance: Express) {
  const candidates = [
    path.resolve(process.cwd(), "artifacts/campus-rideshare/dist/public"),
    path.resolve(process.cwd(), "../campus-rideshare/dist/public"),
    path.resolve(process.cwd(), "../../artifacts/campus-rideshare/dist/public"),
    path.resolve(process.cwd(), "dist/public"),
  ];

  let publicDir = candidates[0];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) {
      publicDir = dir;
      break;
    }
  }

  appInstance.use(express.static(publicDir));
  appInstance.use((req, res, next) => {
    if (req.path.startsWith("/api/") || req.method !== "GET" || !req.accepts("html")) {
      next();
      return;
    }

    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;

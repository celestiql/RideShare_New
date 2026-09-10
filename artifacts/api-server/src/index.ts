import app, { setupFrontend } from "./app";
import { logger } from "./lib/logger";

const PORT = 3000;

await setupFrontend(app);

app.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, `Server listening on http://0.0.0.0:${PORT}`);
});


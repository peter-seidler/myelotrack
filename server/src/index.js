import { config } from './config/index.js';
import { createRepository } from './repositories/index.js';
import { createApp } from './app.js';

/** Entry point: resolve the repository, build the app, start listening. */
async function start() {
  const repo = await createRepository();
  const app = createApp(repo);
  app.listen(config.port, () => {
    console.log(
      `MyeloTrack API listening on http://localhost:${config.port} (backend: ${repo.kind})`,
    );
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

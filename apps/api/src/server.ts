import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config/loadConfig.js';

const config = loadConfig();
const app = await buildApp({ logger: config.nodeEnv !== 'test' });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

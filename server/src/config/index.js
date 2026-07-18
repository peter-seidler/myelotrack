/** Runtime configuration, resolved from the environment with safe defaults. */
export const config = {
  port: Number(process.env.PORT) || 8787,
  dataBackend: process.env.DATA_BACKEND || 'memory',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/myelotrack',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

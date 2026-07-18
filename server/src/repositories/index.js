import { config } from '../config/index.js';
import { createMemoryRepository } from './memory/store.js';

/**
 * Resolve the data repository for the configured backend.
 *
 * - "memory" (default): seeded in-memory store, zero external dependencies.
 * - "mongo": MongoDB via Mongoose — lazily imported so the memory path never
 *   loads mongoose. Implements the same interface as the memory repository.
 *
 * @returns {Promise<object>} a repository implementing the data-access surface
 */
export async function createRepository() {
  if (config.dataBackend === 'mongo') {
    const { createMongoRepository } = await import('./mongo/store.js');
    return createMongoRepository(config.mongoUri);
  }
  return createMemoryRepository();
}

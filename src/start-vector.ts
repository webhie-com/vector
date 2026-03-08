import { ConfigLoader } from './core/config-loader';
import { getVectorInstance } from './core/vector';
import type { DefaultVectorTypes, StartVectorOptions, StartedVectorApp, VectorTypes } from './types';

export async function startVector<TTypes extends VectorTypes = DefaultVectorTypes>(
  options: StartVectorOptions<TTypes> = {}
): Promise<StartedVectorApp<TTypes>> {
  const configLoader = new ConfigLoader<TTypes>(options.configPath);
  const loadedConfig = await configLoader.load();
  const configSource = configLoader.getConfigSource();

  let config = { ...loadedConfig };
  if (options.mutateConfig) {
    config = await options.mutateConfig(config, { configSource });
  }

  if (options.config) {
    config = { ...config, ...options.config };
  }

  if (options.autoDiscover !== undefined) {
    config.autoDiscover = options.autoDiscover;
  }

  const vector = getVectorInstance<TTypes>();
  const resolvedProtectedHandler =
    options.protectedHandler !== undefined ? options.protectedHandler : await configLoader.loadAuthHandler();
  const resolvedCacheHandler =
    options.cacheHandler !== undefined ? options.cacheHandler : await configLoader.loadCacheHandler();

  vector.setProtectedHandler(resolvedProtectedHandler ?? null);
  vector.setCacheHandler(resolvedCacheHandler ?? null);

  const server = await vector.startServer(config);

  return {
    server,
    config,
    stop: () => vector.stop(),
    shutdown: () => vector.shutdown(),
  };
}

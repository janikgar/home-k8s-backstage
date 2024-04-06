import { CatalogBuilder } from '@backstage/plugin-catalog-backend';
import { ScaffolderEntitiesProcessor } from '@backstage/plugin-catalog-backend-module-scaffolder-entity-model';
import { Router } from 'express';
import { PluginEnvironment } from '../types';
import { GithubEntityProvider, GithubDiscoveryProcessor, GithubOrgReaderProcessor } from '@backstage/plugin-catalog-backend-module-github';
import { ScmIntegrations, DefaultGithubCredentialsProvider } from '@backstage/integration';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const builder = await CatalogBuilder.create(env);
  const integrations = ScmIntegrations.fromConfig(env.config);
  const githubCredentialsProvider = DefaultGithubCredentialsProvider.fromIntegrations(integrations);
  builder.addProcessor(
    GithubDiscoveryProcessor.fromConfig(env.config, {
      logger: env.logger,
      githubCredentialsProvider,
    }),
    GithubOrgReaderProcessor.fromConfig(env.config, {
      logger: env.logger,
      githubCredentialsProvider,
    }),
  );
  builder.addProcessor(new ScaffolderEntitiesProcessor());
  const githubProvider = GithubEntityProvider.fromConfig(env.config, {
    logger: env.logger,
    scheduler: env.scheduler,
  });
  builder.addEntityProvider(githubProvider);
  const { processingEngine, router } = await builder.build();
  await processingEngine.start();
  return router;
}

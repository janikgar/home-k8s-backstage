import {
  createRouter,
  providers,
  defaultAuthProviderFactories,
} from '@backstage/plugin-auth-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';
import { stringifyEntityRef, DEFAULT_NAMESPACE } from '@backstage/catalog-model';


export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  return await createRouter({
    logger: env.logger,
    config: env.config,
    database: env.database,
    discovery: env.discovery,
    tokenManager: env.tokenManager,
    providerFactories: {
      ...defaultAuthProviderFactories,
      'authentik': providers.oidc.create({
        signIn: {
          resolver(info, ctx) {
            const userRef = stringifyEntityRef({
              kind: 'User',
              name: info.result.userinfo.sub,
              namespace: DEFAULT_NAMESPACE,
            });
            return ctx.issueToken({
              claims: {
                sub: userRef,
                ent: [userRef],
              },
            });
          },
        },
      }),
    },
  });
}

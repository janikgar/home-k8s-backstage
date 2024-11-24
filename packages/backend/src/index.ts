import { createBackend } from '@backstage/backend-defaults';
import { createBackendModule } from '@backstage/backend-plugin-api';
import { authProvidersExtensionPoint, createOAuthProviderFactory, commonSignInResolvers } from '@backstage/plugin-auth-node';
import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';
import { createSignInResolverFactory } from '@backstage/plugin-auth-node';
import { stringifyEntityRef, DEFAULT_NAMESPACE } from '@backstage/catalog-model';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-techdocs-backend'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://github.com/backstage/backstage/blob/master/docs/auth/guest/provider.md

export const mySignInResolver =
  createSignInResolverFactory({
    create() {
      return async (info, ctx) => {
        const { profile } = info;

        if (!profile.displayName) {
          throw new Error('no display name')
        }

        const userEntity = stringifyEntityRef({
          kind: 'User',
          name: profile.displayName,
          namespace: DEFAULT_NAMESPACE,
        });

        const groupEntity = stringifyEntityRef({
          kind: 'Group',
          name: 'k8s-admin',
          namespace: DEFAULT_NAMESPACE,
        });

        return ctx.issueToken({
          claims: {
            sub: userEntity,
            ent: [
              userEntity,
              groupEntity,
            ],
          }
        })
      }
    }
  });

export const authModuleAuthentikProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'authentik-provider',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'authentik-provider',
          factory: createOAuthProviderFactory({
            authenticator: oidcAuthenticator,
            signInResolverFactories: {
              ...commonSignInResolvers,
              mySignInResolver,
            }
          }),
        });
      },
    });
  },
});

backend.add(authModuleAuthentikProvider);

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@backstage/plugin-catalog-backend-module-github'));

backend.add(import('@backstage/plugin-kubernetes-backend'));

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
// See https://backstage.io/docs/permissions/getting-started for how to create your own permission policy
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// search plugin
backend.add(import('@backstage/plugin-search-backend'));// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));
// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

backend.start();

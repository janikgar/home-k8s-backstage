import { createBackend } from '@backstage/backend-defaults';
import { createBackendModule } from '@backstage/backend-plugin-api';
import { authProvidersExtensionPoint, createOAuthProviderFactory, commonSignInResolvers } from '@backstage/plugin-auth-node';
import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';
import { createSignInResolverFactory } from '@backstage/plugin-auth-node';
import { stringifyEntityRef, DEFAULT_NAMESPACE } from '@backstage/catalog-model';
import { legacyPlugin } from '@backstage/backend-common';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend/alpha'));
backend.add(import('@backstage/plugin-proxy-backend/alpha'));
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));

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
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);
backend.add(import('@backstage/plugin-catalog-backend-module-github/alpha'));

backend.add(import('@backstage/plugin-kubernetes-backend/alpha'));

// permission plugin
backend.add(import('@backstage/plugin-permission-backend/alpha'));
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// search plugin
backend.add(import('@backstage/plugin-search-backend/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-catalog/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs/alpha'));

backend.start();

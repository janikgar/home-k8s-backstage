import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import { authProvidersExtensionPoint, createOAuthProviderFactory } from '@backstage/plugin-auth-node';
import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';
import { stringifyEntityRef, DEFAULT_NAMESPACE } from '@backstage/catalog-model';

const synoSignInResolver = async (info, ctx) => {
  let userName = info.result?.fullProfile?.userinfo?.username;

  console.log(info)

  if (userName === "") {
    throw new Error("username is blank");
  }

  const userEntity = stringifyEntityRef({
    kind: 'User',
    name: userName,
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

export const authModuleSynoProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'syno-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        providers: authProvidersExtensionPoint,
        logger: coreServices.logger,
      },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'syno-provider',
          factory: createOAuthProviderFactory({
            authenticator: oidcAuthenticator,
            signInResolver: synoSignInResolver,
          }),
        });
      },
    });
  },
});
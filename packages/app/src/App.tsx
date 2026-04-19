import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import { OAuth2 } from '@backstage/core-app-api';
import {
  BackstageIdentityApi,
  OpenIdConnectApi,
  ProfileInfoApi,
  SessionApi,
} from '@backstage/core-plugin-api';
import { 
  ApiBlueprint,
  configApiRef,
  createFrontendModule,
  discoveryApiRef,
  oauthRequestApiRef,
  createApiRef,
} from '@backstage/frontend-plugin-api';

const vaultAuthApiRef = createApiRef<
  OpenIdConnectApi & ProfileInfoApi & BackstageIdentityApi & SessionApi
>().with({
  id: 'auth.vault-provider'
})

const vaultAuthApi = ApiBlueprint.make({
  name: 'vault',
  params: defineParams => 
    defineParams({
      api: vaultAuthApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, oauthRequestApi, configApi }) => 
        OAuth2.create({
          configApi,
          discoveryApi,
          oauthRequestApi,
          environment: configApi.getOptionalString('auth.environment'),
          provider: {
            id: 'vault-provider',
            title: 'Vault',
            icon: () => null,
          },
          popupOptions: {
            size: {
              width: 800,
              height: 600,
            },
          },
          defaultScopes: ['openid', 'profile', 'email'],
        })
    })
});

const signInPage = SignInPageBlueprint.make({
  params: {
    loader: async() => props =>
    (
      <SignInPage
        {...props}
        providers={[
          'guest',
          {
            id: 'vault-provider',
            title: 'Vault',
            message: 'Sign in using Vault',
            apiRef: vaultAuthApiRef,
          }
        ]}
      />
    ),
  }
});

export default createApp({
  features: [
    catalogPlugin,
    navModule,
    createFrontendModule({
      pluginId: 'app',
      extensions: [vaultAuthApi, signInPage],
    }),
  ],
});

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
  discoveryApiRef,
  oauthRequestApiRef,
  createApiRef,
} from '@backstage/frontend-plugin-api';


export const vaultAuthApiRef = createApiRef<
  OpenIdConnectApi & ProfileInfoApi & BackstageIdentityApi & SessionApi
>().with({
  id: 'auth.vault-provider'
})

export const vaultAuthApi = ApiBlueprint.make({
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
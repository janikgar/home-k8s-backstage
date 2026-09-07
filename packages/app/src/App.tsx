import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';
import { homeModule } from './modules/home';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import {
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import { vaultAuthApi, vaultAuthApiRef, synoAuthApi, synoAuthApiRef } from './modules/auth';

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
          },
          {
            id: 'syno-provider',
            title: 'Synology',
            message: 'Sign in using Synology',
            apiRef: synoAuthApiRef,
          },
        ]}
      />
    ),
  }
});

export default createApp({
  features: [
    catalogPlugin,
    navModule,
    homeModule,
    createFrontendModule({
      pluginId: 'app',
      extensions: [vaultAuthApi, synoAuthApi, signInPage],
    }),
  ],
});

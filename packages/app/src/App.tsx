import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';
import { homeModule } from './modules/home';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import { useApi, configApiRef, createFrontendModule } from '@backstage/frontend-plugin-api';
import { synoAuthApi, synoAuthApiRef } from './modules/auth';

const signInPage = SignInPageBlueprint.make({
  params: {
    loader: async () => props => {
      const configApi = useApi(configApiRef);
      if (configApi.getString('auth.environment') === 'development') {
        return (
          <SignInPage
            {...props}
            providers={[
              'guest',
              {
                id: 'syno-provider',
                title: 'Synology',
                message: 'Sign in using Synology',
                apiRef: synoAuthApiRef,
              }
            ]}
          />
        );
      }
      return (
        <SignInPage
          {...props}
          provider={{
              id: 'syno-provider',
              title: 'Synology',
              message: 'Sign in using Synology',
              apiRef: synoAuthApiRef,
          }}
        />
      );
    },
  },
});

export default createApp({
  features: [
    catalogPlugin,
    navModule,
    homeModule,
    createFrontendModule({
      pluginId: 'app',
      extensions: [synoAuthApi, signInPage],
    }),
  ],
});

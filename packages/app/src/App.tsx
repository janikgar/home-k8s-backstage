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

// import { Navigate, Route } from 'react-router-dom';
// // import { apiDocsPlugin, ApiExplorerPage } from '@backstage/plugin-api-docs';
// import {
//   CatalogEntityPage,
//   CatalogIndexPage,
//   catalogPlugin,
// } from '@backstage/plugin-catalog';
// import {
//   CatalogImportPage,
//   catalogImportPlugin,
// } from '@backstage/plugin-catalog-import';
// import { ScaffolderPage, scaffolderPlugin } from '@backstage/plugin-scaffolder';
// import { orgPlugin } from '@backstage/plugin-org';
// import { SearchPage } from '@backstage/plugin-search';
// // import { TechRadarPage } from '@backstage/plugin-tech-radar';
// import {
//   TechDocsIndexPage,
//   techdocsPlugin,
//   TechDocsReaderPage,
// } from '@backstage/plugin-techdocs';
// import { TechDocsAddons } from '@backstage/plugin-techdocs-react';
// import { ReportIssue } from '@backstage/plugin-techdocs-module-addons-contrib';
// import { UserSettingsPage } from '@backstage/plugin-user-settings';
// import { apis } from './apis';
// import { entityPage } from './components/catalog/EntityPage';
// import { searchPage } from './components/search/SearchPage';
// import { Root } from './components/Root';

// import {
//   AlertDisplay,
//   OAuthRequestDialog,
//   SignInPage,
// } from '@backstage/core-components';
// import { createApp } from '@backstage/app-defaults';
// import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
// import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
// import { RequirePermission } from '@backstage/plugin-permission-react';
// import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
// import { NotificationsPage } from '@backstage/plugin-notifications';
// import { SignalsDisplay } from '@backstage/plugin-signals';

// import { vaultOIDCAuthApiRef as vaultOIDCAuthApiRef } from './apis';

// const app = createApp({
//   apis,
//   bindRoutes({ bind }) {
//     bind(catalogPlugin.externalRoutes, {
//       createComponent: scaffolderPlugin.routes.root,
//       viewTechDoc: techdocsPlugin.routes.docRoot,
//       createFromTemplate: scaffolderPlugin.routes.selectedTemplate,
//     });
//     // bind(apiDocsPlugin.externalRoutes, {
//     //   registerApi: catalogImportPlugin.routes.importPage,
//     // });
//     bind(scaffolderPlugin.externalRoutes, {
//       registerComponent: catalogImportPlugin.routes.importPage,
//       viewTechDoc: techdocsPlugin.routes.docRoot,
//     });
//     bind(orgPlugin.externalRoutes, {
//       catalogIndex: catalogPlugin.routes.catalogIndex,
//     });
//   },
//   components: {
//     SignInPage: props => (<SignInPage
//       {...props}
//       auto
//       providers={[
//         'guest',
//         {
//           id: 'vault-provider',
//           title: 'Vault',
//           message: 'Sign in using Vault',
//           apiRef: vaultOIDCAuthApiRef,
//         }
//       ]} />),
//   },
// });

// const routes = (
//   <FlatRoutes>
//     <Route path="/" element={<Navigate to="catalog" />} />
//     <Route path="/catalog" element={<CatalogIndexPage />} />
//     <Route
//       path="/catalog/:namespace/:kind/:name"
//       element={<CatalogEntityPage />}
//     >
//       {entityPage}
//     </Route>
//     <Route path="/docs" element={<TechDocsIndexPage />} />
//     <Route
//       path="/docs/:namespace/:kind/:name/*"
//       element={<TechDocsReaderPage />}
//     >
//       <TechDocsAddons>
//         <ReportIssue />
//       </TechDocsAddons>
//     </Route>
//     <Route path="/create" element={<ScaffolderPage />} />
//     {/* <Route path="/api-docs" element={<ApiExplorerPage />} /> */}
//     {/* <Route
//       path="/tech-radar"
//       element={<TechRadarPage width={1500} height={800} />}
//     /> */}
//     <Route
//       path="/catalog-import"
//       element={
//         <RequirePermission permission={catalogEntityCreatePermission}>
//           <CatalogImportPage />
//         </RequirePermission>
//       }
//     />
//     <Route path="/search" element={<SearchPage />}>
//       {searchPage}
//     </Route>
//     <Route path="/settings" element={<UserSettingsPage />} />
//     <Route path="/catalog-graph" element={<CatalogGraphPage />} />
//     <Route path="/notifications" element={<NotificationsPage />} />
//   </FlatRoutes>
// );

// export default app.createRoot(
//   <>
//     <AlertDisplay />
//     <OAuthRequestDialog />
//     <SignalsDisplay />
//     <AppRouter>
//       <Root>{routes}</Root>
//     </AppRouter>
//   </>,
// );

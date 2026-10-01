import { identityApiRef, useApi } from '@backstage/frontend-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import LockIcon from '@material-ui/icons/Lock'

export { synoAuthApi, synoAuthApiRef } from './syno';

export const SidebarSignOutButton = () => {
    const identityApi = useApi(identityApiRef);
    return (
        <SidebarItem
            onClick={() => {identityApi.signOut()}}
            icon={LockIcon}
            text={'Sign Out'}
        />
    )
}
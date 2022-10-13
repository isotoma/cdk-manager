import { Deployment } from './interfaces';

export const _deploymentSelector = (deployments: Deployment[], targetAccount: string, targetSuffix?: string): Deployment => {
    const matching = deployments.filter((d: Deployment): boolean => {
        if (d.account.name != targetAccount) {
            return false;
        }
        if (!targetSuffix && !d.suffix) {
            return true;
        }
        if (targetSuffix == d.suffix) {
            return true;
        }
        return false;
    });
    if (matching.length == 0) {
        throw new Error(`No deployments match account "${targetAccount}" with suffix "${targetSuffix}"`);
    }
    if (matching.length > 1) {
        throw new Error(`Too many deployments match account "${targetAccount}" with suffix "${targetSuffix}"`);
    }
    return matching[0];
};

/**
 * Given a list of deployments, return the one that matches the standard
 * environment variables
 */
export const deploymentSelector = (deployments: Deployment[]): Deployment => {
    const targetAccount = process.env['TARGET_ACCOUNT'];
    if (!targetAccount) {
        throw new Error('TARGET_ACCOUNT is not set');
    }
    const targetSuffix = process.env['TARGET_SUFFIX'];
    return _deploymentSelector(deployments, targetAccount, targetSuffix);
};

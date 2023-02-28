import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Account, Instance, CdkManager, EnvironmentVariables } from 'cdk-manager';

interface Config {
    foo: boolean;
}

class MyCdkManager extends CdkManager<Config> {
    getActivationDefaultAccountName(): string {
        return 'account1';
    }

    getDefaultInstanceProfile(account: Account, instance: Instance<Config>): string {
        return 'account1-Admin';
    }

    getDefaultPipelineDeploymentRegion(account: Account, instance?: Instance<Config>): string {
        return 'eu-west-2';
    }

    async getExtraActivationEnvironmentVariables(envVars: EnvironmentVariables, account: Account, instance?: Instance<Config>): Promise<EnvironmentVariables> {
        if (instance && instance.applicationConfig.foo) {
            return {
                FOO_IS_ENABLED: 'yes'
            };
            
        }
        return {};
    }
}

const accounts: Array<Account> = [{
    name: 'account1',
    accountNumber: '1234',
    cdkBootstrap: {
        enabled: true,
        regions: [
            'eu-west-2',
            'us-east-1',
        ],
        minimumVersion: 13,
    },
}, {
    name: 'account2',
    accountNumber: '2345',
    cdkBootstrap: {
        enabled: true,
        regions: [
            'eu-west-2',
            'us-east-1',
        ],
        minimumVersion: 13,
    },
}, {
    name: 'pipelines',
    accountNumber: '3456',
    cdkBootstrap: {
        enabled: true,
        regions: [
            'eu-west-2',
        ],
        minimumVersion: 13,
    },
}];

const instances: Array<Instance<Config>> = [{
    applicationConfig: {
        foo: true,
    },
    accountName: 'account1',
    branchName: 'main',
    requiresApproval: true,
}, {
    applicationConfig: {
        foo: false,
    },
    accountName: 'account2',
    branchName: 'development',
    requiresApproval: false,
}];

export const manager = new MyCdkManager();

for (const account of accounts) {
    manager.addAccount(account);
}

for (const instance of instances) {
    manager.addInstance(instance);
}

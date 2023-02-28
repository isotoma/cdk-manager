import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Account, Instance, CdkManager } from 'cdk-manager';

interface Config {
    foo: boolean;
}

class MyCdkManager extends CdkManager<Config> {
    getDefaultBootstrapDeploymentProfile(account: Account): string {
        return `${account.name}-Admin`;
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

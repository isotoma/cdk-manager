import * as cdk from 'aws-cdk-lib';
import { BootstrapApplyCliCommand } from './bootstrap-apply';
import { PipelineApplyCliCommand } from './pipeline-apply';
import type { EnvironmentVariables } from './exec-utils';
import type { Account, Instance } from './config';

export class CdkManager<A> {
    accounts: Array<Account>;
    instances: Array<Instance<A>>;

    constructor() {
        this.accounts = [];
        this.instances = [];
    }

    addAccount(account: Account): void {
        this.checkIfAccountNameExists(account.name);
        this.accounts.push(account);
    }

    checkIfAccountNameExists(accountName: string): void {
        if (this.getAccountNames().indexOf(accountName) !== -1) {
            throw new Error(`Account name already exists: ${accountName}`);
        }
    }

    getAccount(accountName: string): Account {
        for (const acc of this.accounts) {
            if (acc.name === accountName) {
                return acc;
            }
        }

        throw new Error(`No account with name: ${accountName}`);
    }

    addInstance(instance: Instance<A>): void {
        this.checkIfSuffixExists(instance.accountName, instance.suffix);
        this.instances.push(instance);
    }

    checkIfSuffixExists(accountName: string, instanceSuffix: string | undefined): void {
        const instanceSuffixes = [];
        for (const inst of this.getInstancesForAccount(accountName)) {
            instanceSuffixes.push(inst.suffix);
        }
        if (instanceSuffixes.indexOf(instanceSuffix) !== -1) {
            throw new Error(`Suffix ${instanceSuffix} already exists in account ${accountName}`);
        }
    }

    getInstancesForAccount(accountName: string): Array<Instance<A>> {
        const account = this.getAccount(accountName);
        const instances = [];
        for (const inst of this.instances) {
            if (inst.accountName === account.name) {
                instances.push(inst);
            }
        }

        return instances;
    }

    getInstanceForAccount(accountName: string, suffix?: string): Instance<A> {
        for (const inst of this.getInstancesForAccount(accountName)) {
            if (inst.suffix === suffix) {
                return inst;
            }
        }
        throw new Error(`No instance with suffix: ${suffix} found for account: ${accountName}`);
    }

    getInstanceForAccountIfExists(accountName: string, suffix?: string): Instance<A> | undefined {
        try {
            return this.getInstanceForAccount(accountName, suffix);
        } catch {
            return undefined;
        }
    }

    getAccountNames(): Array<string> {
        const names = [];
        for (const acc of this.accounts) {
            names.push(acc.name);
        }
        return names;
    }

    getPipelineCdkApp(accountName: string, suffix?: string): cdk.App {
        const account = this.getAccount(accountName);
        const instance = this.getInstanceForAccount(accountName, suffix);

        const app = new cdk.App();
        this.addPipelineCdkStack(app, account, instance);
        return app;
    }

    getPipelineCdkAppFromEnv(): cdk.App {
        const target = process.env['TARGET_ACCOUNT'];
        if (!target) {
            throw Error('TARGET_ACCOUNT not set');
        }
        console.log(`Using account ${target}`);

        const targetSuffix = process.env['TARGET_ENVIRONMENT_SUFFIX'];
        console.log(`Using target suffix ${targetSuffix}`);

        return this.getPipelineCdkApp(target, targetSuffix);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    addPipelineCdkStack(app: cdk.App, account: Account, instance: Instance<A>): cdk.Stack {
        // This is expected to be a subclass of PipelineStack from
        // './pipeline-stack', but doesn't have to be.
        throw new Error('Not implemented');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getPipelineStackName(account: Account, instance: Instance<A>): string {
        throw new Error('Not implemented');
    }

    getActivationEnvironmentVariables(accountName?: string, suffix?: string): EnvironmentVariables {
        const env: EnvironmentVariables = {};
        if (accountName) {
            env['TARGET_ACCOUNT'] = accountName;
        }
        if (accountName && suffix) {
            env['TARGET_ENVIRONMENT_SUFFIX'] = suffix;
        }
        return env;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDefaultPipelineDeploymentProfile(account: Account, instance?: Instance<A>): string {
        throw new Error('Unknown default deployment profile');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDefaultInstanceProfile(account: Account, instance: Instance<A>): string {
        throw new Error('Unknown default instance profile');
    }

    runPipelineApplyFromArgv(argv: Array<string>): void {
        const cmd = new PipelineApplyCliCommand(this);
        cmd.run(argv);
    }

    runBootstrapApplyFromArgv(argv: Array<string>): void {
        const cmd = new BootstrapApplyCliCommand(this);
        cmd.run(argv);
    }
}

import type { CdkManager } from './manager';
import { BaseCliCommand } from './cli-utils'
import type { EnvironmentVariables } from './exec-utils';;
import * as cmdTs from 'cmd-ts';

export const activateCliArgs = {
    account: cmdTs.option({
        type: cmdTs.optional(cmdTs.string),
        long: 'account',
    }),
    suffix: cmdTs.option({
        type: cmdTs.optional(cmdTs.string),
        long: 'suffix',
    }),
    pipelineAccount: cmdTs.flag({
        type: cmdTs.boolean,
        long: 'pipeline-account',
    }),
    region: cmdTs.option({
        type: cmdTs.optional(cmdTs.string),
        long: 'region',
    }),
    noDefaultProfiles: cmdTs.flag({
        type: cmdTs.boolean,
        long: 'no-default-profiles',
    }),
};

export interface ActivateCliCommandArgs {
    account: string | undefined;
    suffix: string | undefined;
    pipelineAccount: boolean;
    region: string | undefined;
    noDefaultProfiles: boolean;
}

export class ActivateCliCommand<A, M extends CdkManager<A>> extends BaseCliCommand<A, M> {

    printEnv(envVars: EnvironmentVariables): void {
        for (const [envVarName, envVarValue] of Object.entries(envVars)) {
            console.log(`export ${envVarName}="${envVarValue}"`);
        }
    };

    async handler(args: ActivateCliCommandArgs): Promise<void> {
        const { account: accountNameInput, suffix, pipelineAccount, region, noDefaultProfiles } = args;
        const accountName = accountNameInput ?? this.manager.getActivationDefaultAccountName();
        const account = this.manager.getAccount(accountName);
        const instance = this.manager.getInstanceForAccountIfExists(accountName, suffix);

        if (!pipelineAccount && !instance) {
            throw new Error('No instance found, so must select the pipeline account');
        }

        const envVars: EnvironmentVariables = {};
        if (!noDefaultProfiles) {
            if (pipelineAccount) {
                
                envVars['AWS_PROFILE'] = this.manager.getDefaultPipelineDeploymentProfile(account, instance);
            } else if (instance) {
                envVars['AWS_PROFILE'] = this.manager.getDefaultInstanceProfile(account, instance);
            }
        }

        if (instance) {
            envVars['TARGET_ACCOUNT'] = instance.accountName;
            if (instance.suffix) {
                envVars['TARGET_ENVIRONMENT_SUFFIX'] = instance.suffix;
            }
        }

        if (region) {
            envVars['AWS_REGION'] = region;
        } else {
            if (pipelineAccount) {
                envVars['AWS_REGION'] = this.manager.getDefaultPipelineDeploymentRegion(account, instance);
            } else if (instance) {
                envVars['AWS_REGION'] = this.manager.getDefaultInstanceRegion(account, instance);
            }
        }

        envVars['AWS_SDK_LOAD_CONFIG'] = '1';

        const extra = await this.manager.getExtraActivationEnvironmentVariables(envVars, account, instance);

        this.printEnv({
            ...envVars,
            ...extra,
        });
    }
}

export const activateCliRun = <A, M extends CdkManager<A>>(manager: M, argv: Array<string>): void => {
    const cls = new ActivateCliCommand(manager);
    cmdTs.run(cmdTs.command({
        name: 'activate',
        args: activateCliArgs,
        handler: cls.handler.bind(cls),
    }), argv);
};

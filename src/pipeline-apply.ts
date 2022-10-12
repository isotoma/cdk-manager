import type { CdkManager } from './manager';
import type { Account, Instance } from './config';
import { BaseCliCommand } from './cli-utils';
import { execPromise, executeCommand, commandSetToString } from './exec-utils';
import type { CommandSet } from './exec-utils';
import * as cmdTs from 'cmd-ts';

export const pipelineApplyCliArgs = {
    account: cmdTs.option({
        type: cmdTs.optional(cmdTs.string),
        long: 'account',
    }),
    noDefaultProfiles: cmdTs.flag({
        type: cmdTs.boolean,
        long: 'no-default-profiles',
    }),
    deploymentSuffix: cmdTs.option({
        type: cmdTs.optional(cmdTs.string),
        long: 'deployment-suffix',
    }),
    apply: cmdTs.flag({
        type: cmdTs.boolean,
        long: 'apply',
    }),
};

export interface PipelineApplyCliCommandArgs {
    account: string | undefined;
    apply: boolean;
    noDefaultProfiles: boolean;
    deploymentSuffix: string | undefined;
}

export class PipelineApplyCliCommand<A, M extends CdkManager<A>> extends BaseCliCommand<A, M> {
    getPipelineDeployShellCommand(account: Account, instance: Instance<A>, extraEnv?: Record<string, string>): { command: string; env: Record<string, string> } {
        const env: Record<string, string> = {
            TARGET_ACCOUNT: account.name,
            ...(extraEnv ?? {}),
        };
        if (instance.suffix) {
            env['TARGET_ENVIRONMENT_SUFFIX'] = instance.suffix;
        }

        return {
            command: `npm run -- cdk deploy --require-approval never -e ${this.manager.getPipelineStackName(account, instance)}`,
            env,
        };
    }

    getLocalBranchSwitchCommand(branchName: string): string {
        return `git checkout ${branchName}`;
    }

    getLocalBranchSwitchUndoCommand(): string {
        return `git checkout -`;
    }

    getPipelineBranchChangeAndDeployCommand(account: Account, instance: Instance<A>, extraEnv?: Record<string, string>): Array<{ command: string; env?: Record<string, string> }> {
        const { command, env } = this.getPipelineDeployShellCommand(account, instance, extraEnv);
        return [
            {
                command: this.getLocalBranchSwitchCommand(instance.branchName),
            },
            {
                command,
                env,
            },
            {
                command: this.getLocalBranchSwitchUndoCommand(),
            },
        ];
    }

    getPipelineApplyCommands(accountName: string, suffix: string | undefined, noDefaultProfiles: boolean): Array<CommandSet> {
        const account = this.manager.getAccount(accountName);
        const instances = this.manager.getInstancesForAccount(account.name);

        const commandSets: Array<CommandSet> = [];

        for (const instance of instances) {
            if (suffix && suffix !== instance.suffix) {
                continue;
            }

            const env: Record<string, string> = {};
            if (!noDefaultProfiles) {
                env['AWS_PROFILE'] = this.manager.getDefaultPipelineDeploymentProfile(account, instance);
            }

            const commands = this.getPipelineBranchChangeAndDeployCommand(account, instance, env);

            commandSets.push(commands);
        }

        return commandSets;
    }

    async handler(args: PipelineApplyCliCommandArgs): Promise<void> {
        const { account, apply, noDefaultProfiles, deploymentSuffix } = args;
        const selectedAccountNames = account ? [account] : this.manager.getAccountNames();
        const commands = [];

        try {
            await execPromise('git diff --quiet');
        } catch (err) {
            console.error('Working directory not clean, aborting. Commit code, then try again.');
            throw err;
        }

        for (const selectedAccountName of selectedAccountNames) {
            commands.push(...this.getPipelineApplyCommands(selectedAccountName, deploymentSuffix, noDefaultProfiles));
        }

        if (apply) {
            console.error('Appling pipelines:');
            for (const command of commands) {
                await executeCommand(command);
            }
        } else {
            console.error('Not doing anything without --apply flag. Would run the following:');
            if (commands.length) {
                for (const command of commands) {
                    console.log(commandSetToString(command));
                }
            } else {
                console.error('(no commands to run)');
            }
        }
    }
}

export const pipelineApplyCliRun = <A, M extends CdkManager<A>>(manager: M, argv: Array<string>): void => {
    const cls = new PipelineApplyCliCommand(manager);
    cmdTs.run(
        cmdTs.command({
            name: 'pipeline-apply',
            args: pipelineApplyCliArgs,
            handler: cls.handler.bind(cls),
        }),
        argv,
    );
};

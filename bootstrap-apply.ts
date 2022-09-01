import * as cmdTs from 'cmd-ts';
import { parse as parseYaml } from 'yaml';
import { BaseCliCommand } from './cli-utils';
import type { CommandSet, EnvironmentVariables } from './exec-utils';
import { commandSetToString, execPromise, executeCommand } from './exec-utils';
import type { CdkManager } from './manager';

export const bootstrapApplyCliArgs = {
    account: cmdTs.option({
        type: cmdTs.optional(cmdTs.string),
        long: 'account',
    }),
    region: cmdTs.option({
        type: cmdTs.optional(cmdTs.string),
        long: 'region',
    }),
    noDefaultProfiles: cmdTs.flag({
        type: cmdTs.boolean,
        long: 'no-default-profiles',
    }),
    apply: cmdTs.flag({
        type: cmdTs.boolean,
        long: 'apply',
    }),
};

export interface BootstrapApplyCliCommandArgs {
    account: string | undefined;
    region: string | undefined;
    apply: boolean;
    noDefaultProfiles: boolean;
}

export class BootstrapApplyCliCommand<A, M extends CdkManager<A>> extends BaseCliCommand<A, M> {
    getBootstrapCommands(accountName: string, region: string | undefined, noDefaultProfiles: boolean, currentCdkProvidedBootstrapVersion: number): Array<CommandSet> {
        const account = this.manager.getAccount(accountName);
        if (!account.cdkBootstrap) {
            return [];
        }
        if (!account.cdkBootstrap.enabled) {
            return [];
        }

        const bootstrapConfig = account.cdkBootstrap;

        if (region && !bootstrapConfig.regions.includes(region)) {
            console.error(`Skipping account ${accountName} for selected region ${region}, as not enabled`);
            return [];
        }

        if (currentCdkProvidedBootstrapVersion < bootstrapConfig.minimumVersion) {
            console.error(`Skipping account ${accountName} as it requires CDK bootstrap version ${bootstrapConfig.minimumVersion}, but version ${currentCdkProvidedBootstrapVersion} is required`);
            return [];
        }

        const selectedRegions = region ? [region] : bootstrapConfig.regions;
        const trustedAccountNumbers = [];
        for (const trustedAccountName of bootstrapConfig.trustedAccountNames ?? []) {
            trustedAccountNumbers.push(this.manager.getAccount(trustedAccountName).accountNumber);
        }
        const trustFlags = [];
        for (const trustedAccountNumber of trustedAccountNumbers) {
            trustFlags.push(...['--trust', trustedAccountNumber]);
            trustFlags.push(...['--trust-for-lookup', trustedAccountNumbers]);
        }

        const commands: Array<CommandSet> = [];

        const env: EnvironmentVariables = {
            NO_SYNTH: 'yes',
        };
        if (!noDefaultProfiles) {
            env['AWS_PROFILE'] = this.manager.getDefaultBootstrapDeploymentProfile(account);
        }

        for (const selectedRegion of selectedRegions) {
            const commandParts = [
                'npm',
                'run',
                '--',
                'cdk',
                'bootstrap',
                `aws://${account.accountNumber}/${selectedRegion}`,
                ...trustFlags,
                '--cloudformation-execution-policies',
                'arn:aws:iam::aws:policy/AdministratorAccess',
            ];

            commands.push([
                {
                    command: commandParts.join(' '),
                    env: env,
                },
            ]);
        }

        return commands;
    }

    async getCdkBootstrapVersion(): Promise<number> {
        const { stdout } = await execPromise('npm run --silent -- cdk bootstrap --show-template', {
            env: {
                ...process.env,
                NO_SYNTH: 'yes',
            },
        });

        const parsed = parseYaml(stdout);
        const version = parsed?.Resources?.CdkBootstrapVersion?.Properties?.Value;

        if (!version) {
            throw new Error('Unable to find a version number from bootstrap template');
        }

        return parseInt(version, 10);
    }

    async handler(args: BootstrapApplyCliCommandArgs): Promise<void> {
        const { account, region, apply, noDefaultProfiles } = args;
        const selectedAccountNames = account ? [account] : this.manager.getAccountNames();
        const commands = [];

        const currentCdkProvidedBootstrapVersion = await this.getCdkBootstrapVersion();

        for (const selectedAccountName of selectedAccountNames) {
            commands.push(...this.getBootstrapCommands(selectedAccountName, region, noDefaultProfiles, currentCdkProvidedBootstrapVersion));
        }

        if (apply) {
            console.error('Bootstrapping:');
            for (const command of commands) {
                await executeCommand(command);
                // TODO: print the account, region and new bootstrap version
            }
        } else {
            console.error('Not doing anything with --apply flag. Would run the following:');
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

export const bootstrapApplyCliRun = <A, M extends CdkManager<A>>(manager: M, argv: Array<string>): void => {
    const cls = new BootstrapApplyCliCommand(manager);
    cmdTs.run(cmdTs.command({
        name: 'bootstrap-apply',
        args: bootstrapApplyCliArgs,
        handler: cls.handler.bind(cls),
    }), argv);
};

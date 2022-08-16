import { Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { parse as parseYaml } from 'yaml';

import * as cmdTs from 'cmd-ts';
import * as cdk from 'aws-cdk-lib';
import { exec } from 'child_process';
import { promisify } from 'util';

export interface CodeBuildContext {
    commitSha?: string;
    buildNumber?: string;
}

export const execPromise = promisify(exec);

export type EnvironmentVariables = Record<string, string>;

export interface Command {
    command: string;
    env?: EnvironmentVariables;
}

export type CommandSet = Array<Command>;

export const envToString = (env: EnvironmentVariables): string => {
    const parts: Array<string> = [];
    for (const [key, value] of Object.entries(env)) {
        parts.push(`${key}="${value}"`);
    }
    return parts.join(' ');
};

export const commandToString = (command: Command): string => {
    if (command.env && Object.keys(command.env).length) {
        return `${envToString(command.env)} ${command.command}`;
    } else {
        return command.command;
    }
};

export const commandSetToString = (commandSet: CommandSet): string => {
    const parts = [];
    for (const command of commandSet) {
        parts.push(commandToString(command));
    }
    return parts.join(' && ');
};

export const executeCommand = async (commandSet: CommandSet): Promise<void> => {
    console.error(`Running: ${commandSetToString(commandSet)}`);
    await execPromise(commandSetToString(commandSet));
    console.error('Done');
};

export const filterNils = <A>(array: Array<A | undefined>): Array<A> => {
    const filtered: Array<A> = [];
    for (const item of array) {
        if (typeof item !== 'undefined') {
            filtered.push(item);
        }
    }
    return filtered;
};

// Common
interface CdkBootstrapConfigEnabled {
    enabled: true;
    regions: Array<string>;
    minimumVersion: number;
    trustedAccountNames?: Array<string>;
}

interface CdkBootstrapConfigDisabled {
    enabled: false;
}

export interface Account {
    name: string;
    accountNumber: string;
    cdkBootstrap?: CdkBootstrapConfigEnabled | CdkBootstrapConfigDisabled;
}

export interface SubInstance<A> {
    applicationConfig: A;
    accountName: string;
    requiresApproval: boolean;
    suffix?: string;
}

export interface Instance<A> extends SubInstance<A> {
    applicationConfig: A;
    accountName: string;
    branchName: string;
    requiresApproval: boolean;
    suffix?: string;
    sequencedInstances?: Array<SubInstance<A>>;
}

// TODO: is there a way of making these easier to extend?
export abstract class BaseCliCommand<A, M extends CdkManager<A>> {
    public readonly manager: M;
    constructor(manager: M) {
        this.manager = manager;
    }

    abstract run(argv: Array<string>): void;
}

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
        }

        const commands: Array<CommandSet> = [];

        const env: EnvironmentVariables = {
            NO_SYNTH: 'yes',
        };
        if (!noDefaultProfiles) {
            env['AWS_PROFILE'] = this.manager.getDefaultPipelineDeploymentProfile(account);
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

    run(argv: Array<string>): void {
        const cmd = cmdTs.command({
            name: 'bootstrapper',
            args: {
                account: cmdTs.option({
                    type: cmdTs.optional(cmdTs.oneOf(this.manager.getAccountNames())),
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
            },
            handler: this.handler.bind(this),
        });

        cmdTs.run(cmd, argv);
    }
}

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

    run(argv: Array<string>): void {
        const cmd = cmdTs.command({
            name: 'pipeline-apply',
            args: {
                account: cmdTs.option({
                    type: cmdTs.optional(cmdTs.oneOf(this.manager.getAccountNames())),
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
            },
            handler: this.handler.bind(this),
        });

        cmdTs.run(cmd, argv);
    }
}

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

export class PipelineStack<A> extends Stack {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getSourceConnection(accountConfig: Account, pipelineConfig: Instance<A>): pipelines.IFileSetProducer {
        throw new Error('Not implemented');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getInstallCommands(accountConfig: Account, pipelineConfig: Instance<A>): Array<string> {
        throw new Error('Not implemented');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getCommands(accountConfig: Account, pipelineConfig: Instance<A>): Array<string> {
        throw new Error('Not implemented');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    addStacksToDeploymentStage(stage: Stage, accountConfig: Account, pipelineConfig: SubInstance<A>, codeBuildContext: CodeBuildContext): void {
        throw new Error('Not implemented');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getStageProps(accountConfig: Account, pipelineConfig: SubInstance<A>): StageProps {
        return {};
    }

    createStage(accountConfig: Account, pipelineConfig: SubInstance<A>): Stage {
        const stage = new Stage(this, filterNils([accountConfig.name, pipelineConfig.suffix]).join('-'), this.getStageProps(accountConfig, pipelineConfig));
        const codeBuildContext = {
            commitSha: process.env['CODEBUILD_RESOLVED_SOURCE_VERSION'],
            buildNumber: process.env['CODEBUILD_BUILD_NUMBER'],
        };

        this.addStacksToDeploymentStage(stage, accountConfig, pipelineConfig, codeBuildContext);
        return stage;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getCodeBuildOptions(accountConfig: Account, pipelineConfig: Instance<A>): pipelines.CodeBuildOptions {
        return {
            buildEnvironment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_6_0,
            },
            partialBuildSpec: codebuild.BuildSpec.fromObject({
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: '16.x',
                        },
                    },
                },
            }),
        };
    }

    public readonly manager: CdkManager<A>;

    constructor(scope: Construct, id: string, manager: CdkManager<A>, accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps) {
        super(scope, id, stackProps);
        this.manager = manager;

        const pipeline = new pipelines.CodePipeline(this, 'pipeline', {
            dockerEnabledForSynth: false,
            synth: new pipelines.ShellStep('synth', {
                input: this.getSourceConnection(accountConfig, pipelineConfig),
                installCommands: this.getInstallCommands(accountConfig, pipelineConfig),
                commands: this.getCommands(accountConfig, pipelineConfig),
                env: {
                    TARGET_ACCOUNT: accountConfig.name,
                    ...(pipelineConfig.suffix
                        ? {
                              TARGET_ENVIRONMENT_SUFFIX: pipelineConfig.suffix,
                          }
                        : {}),
                },
            }),
            crossAccountKeys: true,
            codeBuildDefaults: {
                buildEnvironment: {
                    buildImage: codebuild.LinuxBuildImage.STANDARD_6_0,
                    environmentVariables: {
                        DOCKER_BUILDKIT: {
                            value: '1',
                        },
                    },
                },
                partialBuildSpec: codebuild.BuildSpec.fromObject({
                    phases: {
                        install: {
                            'runtime-versions': {
                                nodejs: '16.x',
                            },
                        },
                    },
                }),
            },
            dockerCredentials: [pipelines.DockerCredential.dockerHub(secrets.Secret.fromSecretNameV2(this, 'docker-hub-secret', 'docker-hub'))],
            assetPublishingCodeBuildDefaults: {
                buildEnvironment: {
                    computeType: codebuild.ComputeType.MEDIUM,
                },
            },
        });

        if (pipelineConfig.sequencedInstances) {
            for (const sequencedPipeline of pipelineConfig.sequencedInstances) {
                const sequencedAccount = manager.getAccount(sequencedPipeline.accountName);
                pipeline.addStage(
                    this.createStage(sequencedAccount, sequencedPipeline),
                    sequencedPipeline.requiresApproval
                        ? {
                              pre: [
                                  new pipelines.ManualApprovalStep(`DeployTo_${sequencedAccount.name}`, {
                                      comment: `Deploy to ${sequencedAccount.name} (${sequencedPipeline.suffix}) (${sequencedAccount.accountNumber})`,
                                  }),
                              ],
                          }
                        : {},
                );
            }
        }

        pipeline.addStage(
            this.createStage(accountConfig, pipelineConfig),
            pipelineConfig.requiresApproval
                ? {
                      pre: [
                          new pipelines.ManualApprovalStep(`DeployTo_${accountConfig.name}`, {
                              comment: `Deploy to ${accountConfig.name} (${pipelineConfig.suffix}) (${accountConfig.accountNumber})`,
                          }),
                      ],
                  }
                : {},
        );

        pipeline.buildPipeline();
    }
}

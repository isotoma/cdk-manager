import { Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import type { Construct } from 'constructs';
import type { Account, Instance, SubInstance } from './config';
import type { CdkManager } from './manager';

export const filterNils = <A>(array: Array<A | undefined>): Array<A> => {
    const filtered: Array<A> = [];
    for (const item of array) {
        if (typeof item !== 'undefined') {
            filtered.push(item);
        }
    }
    return filtered;
};

export interface CodeBuildContext {
    commitSha?: string;
    buildNumber?: string;
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
        const nodeVersion = pipelineConfig.nodeVersion ? pipelineConfig.nodeVersion : 16;
        const buildImage = pipelineConfig.nodeVersion == 18 ? codebuild.LinuxBuildImage.STANDARD_7_0 : codebuild.LinuxBuildImage.STANDARD_6_0;

        return {
            buildEnvironment: {
                buildImage: buildImage,
            },
            partialBuildSpec: codebuild.BuildSpec.fromObject({
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: `${nodeVersion}.x`,
                        },
                    },
                },
            }),
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDockerCredentials(accountConfig: Account, pipelineConfig: SubInstance<A>): Array<pipelines.DockerCredential> {
        return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getPipelineSynthProjectAllowedRoleArns(accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps): string[] {
        const cdkLookupRolePrefix = 'cdk-hnb659fds-lookup-role';
        return [
            `arn:aws:iam::${accountConfig.accountNumber}:role/${cdkLookupRolePrefix}-${accountConfig.accountNumber}-${this.region}`,
            `arn:aws:iam::${this.account}:role/${cdkLookupRolePrefix}-${this.account}-${this.region}`,
        ];
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getOtherPipelineProps(accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps): Partial<pipelines.CodePipelineProps> {
        return {};
    }

    public readonly manager: CdkManager<A>;
    public readonly pipeline: pipelines.CodePipeline;

    constructor(scope: Construct, id: string, manager: CdkManager<A>, accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps) {
        super(scope, id, stackProps);
        this.manager = manager;

        this.pipeline = new pipelines.CodePipeline(this, 'pipeline', {
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
            codeBuildDefaults: this.getCodeBuildOptions(accountConfig, pipelineConfig),
            dockerCredentials: this.getDockerCredentials(accountConfig, pipelineConfig),
            assetPublishingCodeBuildDefaults: {
                buildEnvironment: {
                    computeType: codebuild.ComputeType.MEDIUM,
                },
            },
            ...this.getOtherPipelineProps(accountConfig, pipelineConfig, stackProps),
        });

        if (pipelineConfig.sequencedInstances) {
            for (const sequencedPipeline of pipelineConfig.sequencedInstances) {
                const sequencedAccount = manager.getAccount(sequencedPipeline.accountName);
                this.pipeline.addStage(
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

        this.pipeline.addStage(
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

        this.pipeline.buildPipeline();
        const allowedRoles = this.getPipelineSynthProjectAllowedRoleArns(accountConfig, pipelineConfig, stackProps);
        if (allowedRoles.length > 0) {
            this.pipeline.synthProject.addToRolePolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['sts:AssumeRole'],
                    resources: allowedRoles,
                }),
            );
        }
    }
}

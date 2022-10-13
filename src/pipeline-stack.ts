import { Stack, StackProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import type { Construct } from 'constructs';
import { BuildContext, SourceLibrary, StageBuilder } from './interfaces';
export const filterNils = <A>(array: Array<A | undefined>): Array<A> => {
    const filtered: Array<A> = [];
    for (const item of array) {
        if (typeof item !== 'undefined') {
            filtered.push(item);
        }
    }
    return filtered;
};

export interface PipelineStackProps extends StackProps {
    buildContext: BuildContext;
    sourceLibrary: SourceLibrary;
    stageBuilder: StageBuilder;
}

export class PipelineStack extends Stack {
    pipeline: pipelines.CodePipeline;
    constructor(scope: Construct, id: string, props: PipelineStackProps) {
        super(scope, id, props);
        const missingEnvironment = props.sourceLibrary.requiredEnvironment.filter((r) => !Object.keys(props.buildContext.environment).includes(r));
        if (missingEnvironment.length > 0) {
            throw new Error(`Build context does not provide required environment variables: ${missingEnvironment.join(' ')}`);
        }
        this.pipeline = new pipelines.CodePipeline(this, 'pipeline', {
            dockerEnabledForSynth: false,
            synth: new pipelines.ShellStep('synth', {
                input: props.sourceLibrary.sourceConnection,
                installCommands: props.sourceLibrary.installCommands,
                commands: props.sourceLibrary.synthCommands,
                env: props.buildContext.environment,
            }),
            crossAccountKeys: true,
            codeBuildDefaults: props.buildContext.codeBuildOptions,
            dockerCredentials: props.buildContext.dockerCredentials,
            assetPublishingCodeBuildDefaults: {
                buildEnvironment: {
                    computeType: codebuild.ComputeType.MEDIUM,
                },
            },
            ...props.buildContext.pipelineProps,
        });

        for (const t of props.stageBuilder.targets) {
            this.pipeline.addStage(
                props.stageBuilder.createStage(this, t),
                t.requiresApproval
                    ? {
                          pre: [new pipelines.ManualApprovalStep(`DeployTo_${t.account.name}`)],
                      }
                    : {},
            );
        }
        this.pipeline.buildPipeline();
        if (props.buildContext.assumeRoleArns.length > 0) {
            this.pipeline.synthProject.addToRolePolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['sts:AssumeRole'],
                    resources: props.buildContext.assumeRoleArns,
                }),
            );
        }
    }
}

// export class OldPipelineStack<A> extends Stack {
//     // eslint-disable-next-line @typescript-eslint/no-unused-vars
//     getCodeBuildOptions(accountConfig: Account, pipelineConfig: Instance<A>): pipelines.CodeBuildOptions {
//         return {
//             buildEnvironment: {
//                 buildImage: codebuild.LinuxBuildImage.STANDARD_6_0,
//             },
//             partialBuildSpec: codebuild.BuildSpec.fromObject({
//                 phases: {
//                     install: {
//                         'runtime-versions': {
//                             nodejs: '16.x',
//                         },
//                     },
//                 },
//             }),
//         };
//     }

//     // eslint-disable-next-line @typescript-eslint/no-unused-vars
//     getDockerCredentials(accountConfig: Account, pipelineConfig: SubInstance<A>): Array<pipelines.DockerCredential> {
//         return [];
//     }

//     // eslint-disable-next-line @typescript-eslint/no-unused-vars
//     getPipelineSynthProjectAllowedRoleArns(accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps): string[] {
//         const cdkLookupRolePrefix = 'cdk-hnb659fds-lookup-role';
//         return [
//             `arn:aws:iam::${accountConfig.accountNumber}:role/${cdkLookupRolePrefix}-${accountConfig.accountNumber}-${this.region}`,
//             `arn:aws:iam::${this.account}:role/${cdkLookupRolePrefix}-${this.account}-${this.region}`,
//         ];
//     }

//     // eslint-disable-next-line @typescript-eslint/no-unused-vars
//     getOtherPipelineProps(accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps): Partial<pipelines.CodePipelineProps> {
//         return {};
//     }

//     public readonly manager: CdkManager<A>;
//     public readonly pipeline: pipelines.CodePipeline;

//     constructor(scope: Construct, id: string, manager: CdkManager<A>, accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps) {
//         super(scope, id, stackProps);
//         this.manager = manager;

//         this.pipeline = new pipelines.CodePipeline(this, 'pipeline', {
//             dockerEnabledForSynth: false,
//             synth: new pipelines.ShellStep('synth', {
//                 input: this.getSourceConnection(accountConfig, pipelineConfig),
//                 installCommands: this.getInstallCommands(accountConfig, pipelineConfig),
//                 commands: this.getCommands(accountConfig, pipelineConfig),
//                 env: {
//                     TARGET_ACCOUNT: accountConfig.name,
//                     ...(pipelineConfig.suffix
//                         ? {
//                               TARGET_ENVIRONMENT_SUFFIX: pipelineConfig.suffix,
//                           }
//                         : {}),
//                 },
//             }),
//             crossAccountKeys: true,
//             codeBuildDefaults: this.getCodeBuildOptions(accountConfig, pipelineConfig),
//             dockerCredentials: this.getDockerCredentials(accountConfig, pipelineConfig),
//             assetPublishingCodeBuildDefaults: {
//                 buildEnvironment: {
//                     computeType: codebuild.ComputeType.MEDIUM,
//                 },
//             },
//             ...this.getOtherPipelineProps(accountConfig, pipelineConfig, stackProps),
//         });

//         if (pipelineConfig.sequencedInstances) {
//             for (const sequencedPipeline of pipelineConfig.sequencedInstances) {
//                 const sequencedAccount = manager.getAccount(sequencedPipeline.accountName);
//                 this.pipeline.addStage(
//                     this.createStage(sequencedAccount, sequencedPipeline),
//                     sequencedPipeline.requiresApproval
//                         ? {
//                               pre: [
//                                   new pipelines.ManualApprovalStep(`DeployTo_${sequencedAccount.name}`, {
//                                       comment: `Deploy to ${sequencedAccount.name} (${sequencedPipeline.suffix}) (${sequencedAccount.accountNumber})`,
//                                   }),
//                               ],
//                           }
//                         : {},
//                 );
//             }
//         }

//         this.pipeline.addStage(
//             this.createStage(accountConfig, pipelineConfig),
//             pipelineConfig.requiresApproval
//                 ? {
//                       pre: [
//                           new pipelines.ManualApprovalStep(`DeployTo_${accountConfig.name}`, {
//                               comment: `Deploy to ${accountConfig.name} (${pipelineConfig.suffix}) (${accountConfig.accountNumber})`,
//                           }),
//                       ],
//                   }
//                 : {},
//         );

//         this.pipeline.buildPipeline();
//         const allowedRoles = this.getPipelineSynthProjectAllowedRoleArns(accountConfig, pipelineConfig, stackProps);
//         if (allowedRoles.length > 0) {
//             this.pipeline.synthProject.addToRolePolicy(
//                 new iam.PolicyStatement({
//                     effect: iam.Effect.ALLOW,
//                     actions: ['sts:AssumeRole'],
//                     resources: allowedRoles,
//                 }),
//             );
//         }
//     }
// }

import { Stage, StageProps, Environment } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { CodeBuildOptions } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { BuildContext, Deployment, DeploymentTarget, SourceLibrary, StageBuilder } from './interfaces';

export const filterNils = <A>(array: Array<A | undefined>): Array<A> => {
    const filtered: Array<A> = [];
    for (const item of array) {
        if (typeof item !== 'undefined') {
            filtered.push(item);
        }
    }
    return filtered;
};

export abstract class BaseSourceLibrary implements SourceLibrary {
    protected deployment: Deployment;

    constructor(deployment: Deployment) {
        this.deployment = deployment;
    }

    abstract get sourceConnection(): pipelines.IFileSetProducer;

    get synthCommands(): string[] {
        return ['npm run cdk synth'];
    }

    get installCommands(): string[] {
        return ['npm install -g npm@8', 'npm ci', 'npm run build'];
    }

    get requiredEnvironment(): string[] {
        return ['TARGET_ACCOUNT', 'TARGET_ACCOUNT_SUFFIX'];
    }
}

export interface BuildContextProps {
    readonly includeLookupRole: boolean;
}

export class BaseBuildContext implements BuildContext {
    protected deployment: Deployment;
    private includeLookupRole: boolean;

    constructor(deployment: Deployment, props: BuildContextProps) {
        this.deployment = deployment;
        this.includeLookupRole = props.includeLookupRole;
    }

    allTargets(): DeploymentTarget[] {
        return [this.deployment, ...(this.deployment.otherTargets ?? [])];
    }

    get codeBuildOptions(): CodeBuildOptions {
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

    get dockerCredentials(): Array<pipelines.DockerCredential> {
        return [];
    }

    get pipelineProps(): Partial<pipelines.CodePipelineProps> {
        return {};
    }

    get assumeRoleArns(): string[] {
        if (this.includeLookupRole) {
            const lookupRole = (n: string) => `arn:aws:iam::${n}:role/cdk-hnb659fds-lookup-role-${n}-eu-west-2`;
            return this.allTargets().map((t) => lookupRole(t.account.number));
        } else {
            return [];
        }
    }

    get environment(): Record<string, string> {
        return {
            TARGET_ACCOUNT: this.deployment.account.name,
            ...(this.deployment.suffix
                ? {
                      TARGET_ENVIRONMENT_SUFFIX: this.deployment.suffix,
                  }
                : {}),
        };
    }
}

export abstract class BaseStageBuilder implements StageBuilder {
    protected deployment: Deployment;

    constructor(deployment: Deployment) {
        this.deployment = deployment;
    }

    get targets(): DeploymentTarget[] {
        return [this.deployment, ...(this.deployment.otherTargets ?? [])];
    }

    stackEnv(target: DeploymentTarget): Environment {
        return {
            account: target.account.number,
            region: target.region ?? target.account.defaultRegion,
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stageProps(target: DeploymentTarget): StageProps {
        return {
            env: {
                account: this.deployment.account.number,
                region: target.region ?? this.deployment.account.defaultRegion,
            },
        };
    }

    abstract createStacks(scope: Construct, target: DeploymentTarget): void;

    createStage(scope: Construct, target: DeploymentTarget): Stage {
        const stage = new Stage(scope, filterNils([target.account.name, target.suffix]).join('-'), this.stageProps(target));
        this.createStacks(stage, target);
        return stage;
    }
}

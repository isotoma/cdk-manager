import { pipelines, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface CdkBootstrapConfigEnabled {
    readonly enabled: true;
    readonly regions: Array<string>;
    readonly minimumVersion: number;
    readonly trustedAccountNames?: Array<string>;
}

export interface CdkBootstrapConfigDisabled {
    readonly enabled: false;
}

export interface AwsAccount {
    readonly name: string;
    readonly number: string;
    readonly defaultRegion: string;
    readonly cdkBootstrap?: CdkBootstrapConfigDisabled | CdkBootstrapConfigEnabled;
}

export interface DeploymentTarget {
    /**
     * The AWS Account to deploy to
     */
    readonly account: AwsAccount;
    /**
     * The region to deploy to. If this is not present then the default region
     * for the account should be used
     */
    readonly region?: string;

    /**
     * If this target requires approval, then an approval step will be added
     * to the pipeline
     */
    readonly requiresApproval: boolean;

    readonly suffix?: string;
}

export interface Deployment extends DeploymentTarget {
    /**
     * The name of the branch from which this will deploy.
     */
    readonly branch: string;

    /**
     * The targets to which this deployment will deploy.
     */
    readonly otherTargets?: DeploymentTarget[];
}

export interface SourceLibrary {
    /**
     * Return a connection to the source repository
     */
    readonly sourceConnection: pipelines.IFileSetProducer;

    /**
     * The commands that are required to install the build tools
     */
    readonly installCommands: Array<string>;

    /**
     * The commands that are required to synthesize the stacks.
     */
    readonly synthCommands: Array<string>;

    /**
     * The environment required by the software to successfully produce output.
     * If these are not provided by the BuildContext then an exception will be raised.
     */
    readonly requiredEnvironment: string[];
}

export interface BuildContext {
    /**
     * The code build defaults assed to the code pipeline
     */
    readonly codeBuildOptions: pipelines.CodeBuildOptions;
    /**
     * Any docker credentials required for the build to execute
     */
    readonly dockerCredentials: Array<pipelines.DockerCredential>;
    /**
     * Any additional pipeline properties required
     */
    readonly pipelineProps: Partial<pipelines.CodePipelineProps>;
    /**
     * A list of role arns that the build step may need to assume
     */
    readonly assumeRoleArns: string[];
    /**
     * The environment provided to the build stage
     */
    readonly environment: Record<string, string>;
}

export interface StageBuilder {
    /**
     * The list of accounts and regions to which to deploy
     */
    readonly targets: DeploymentTarget[];

    /**
     * The properties for the deployment stage for the provided target
     */
    stageProps(target: DeploymentTarget): StageProps;

    /**
     * Create a code pipeline stage, using the stage props from stageProps
     */
    createStage(scope: Construct, target: DeploymentTarget): Stage;

    /**
     * Create the stacks for the provided target, within the provided scope
     */
    createStacks(scope: Construct, target: DeploymentTarget): void;
}

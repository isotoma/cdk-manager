import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { PipelineStack } from '../src';
import { BaseBuildContext, BaseSourceLibrary, BaseStageBuilder } from '../src/base';
import { AwsAccount, Deployment, DeploymentTarget } from '../src/interfaces';
import { deploymentSelector } from '../src/launch';

export interface ApplicationConfiguration {
    bucketIsPublic: boolean;
    bucketName: string;
}

export interface ExampleDeployment extends Deployment {
    readonly application: ApplicationConfiguration;
}

export class ExampleSourceLibrary extends BaseSourceLibrary {
    get sourceConnection(): pipelines.IFileSetProducer {
        return pipelines.CodePipelineSource.connection('org/repo', this.deployment.branch, {
            connectionArn: 'connectionArn',
        });
    }
}

export interface ExampleStackProps extends cdk.StackProps, ApplicationConfiguration {}

export class ExampleStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ExampleStackProps) {
        super(scope, id, props);
        new s3.Bucket(this, 'bucket', {
            bucketName: props.bucketName,
            blockPublicAccess: props.bucketIsPublic ? undefined : s3.BlockPublicAccess.BLOCK_ALL,
        });
    }
}

export class ExampleStageBuilder extends BaseStageBuilder {
    deployment: ExampleDeployment;

    createStacks(scope: Construct, target: DeploymentTarget): void {
        new ExampleStack(scope, 'example', {
            ...this.deployment.application,
            env: this.stackEnv(target),
        });
    }
}

const accounts: Record<string, AwsAccount> = {
    production: {
        number: '123456789012',
        name: 'production',
        defaultRegion: 'us-east-1',
    },
    stage: {
        number: '234567890123',
        name: 'stage',
        defaultRegion: 'us-east-1',
    },
    develop: {
        number: '345678901234',
        name: 'develop',
        defaultRegion: 'us-east-1',
    },
};

const deployments: ExampleDeployment[] = [
    {
        account: accounts['stage'],
        branch: 'production',
        requiresApproval: false,
        otherTargets: [
            {
                account: accounts['production'],
                requiresApproval: true,
            },
        ],
        application: {
            bucketIsPublic: false,
            bucketName: 'my-example-prod',
        },
    },
    {
        account: accounts['develop'],
        branch: 'main',
        requiresApproval: false,
        application: {
            bucketIsPublic: true,
            bucketName: 'my-example-dev',
        },
    },
];

const deployment = deploymentSelector(deployments);

const sourceLibrary = new ExampleSourceLibrary(deployment);
const buildContext = new BaseBuildContext(deployment, { includeLookupRole: true });
const stageBuilder = new ExampleStageBuilder(deployment);

const app = new cdk.App();
new PipelineStack(app, `${deployment.account.name}-example`, {
    sourceLibrary,
    buildContext,
    stageBuilder,
});

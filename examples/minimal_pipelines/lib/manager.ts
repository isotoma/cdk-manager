import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Account, Instance, SubInstance, CdkManager, PipelineStack, CodeBuildContext } from 'cdk-manager';
import { ExampleStack } from './example-stack';

interface Config {
    foo: boolean;
}

class MyPipelineStack extends PipelineStack<Config> {
    getSourceConnection(accountConfig: Account, pipelineConfig: Instance<Config>): pipelines.IFileSetProducer {
        return pipelines.CodePipelineSource.connection('myorg/myrepo', pipelineConfig.branchName, {
            connectionArn: 'arn:myconnectionarn',
        });
    }

    getInstallCommands(accountConfig: Account, pipelineConfig: Instance<Config>): Array<string> {
        return ['./pipeline_hooks/install.sh'];
    }

    getCommands(accountConfig: Account, pipelineConfig: Instance<Config>): Array<string> {
        return [`./pipeline_hooks/synth.sh ${accountConfig.name} ${pipelineConfig.suffix}`];
    }

    addStacksToDeploymentStage(stage: cdk.Stage, accountConfig: Account, pipelineConfig: SubInstance<Config>, codeBuildContext: CodeBuildContext): void {
        new ExampleStack(stage, 'example');
    }
}

class MyCdkManager extends CdkManager<Config> {
    addPipelineCdkStack(app: cdk.App, account: Account, instance: Instance<Config>): cdk.Stack {
        return new MyPipelineStack(app, this.getPipelineStackName(account, instance), this, account, instance, {
            env: {
                account: this.getAccount('pipelines').accountNumber,
                region: 'eu-west-1',
            },
        });
    }

    getPipelineStackName(account: Account, instance: Instance<Config>): string {
        const base = `${account.name}-mystack-pipeline`;
        if (instance.suffix) {
            return `${base}-${instance.suffix}`;
        }
        return base;
    }

    getDefaultBootstrapDeploymentProfile(account: Account): string {
        return `${account.name}-Admin`;
    }

    getDefaultPipelineDeploymentProfile(account: Account, instance?: Instance<Config>): string {
        return 'pipelines-admin';
    }
}

const accounts: Array<Account> = [{
    name: 'account1',
    accountNumber: '1234',
}, {
    name: 'account2',
    accountNumber: '2345',
}, {
    name: 'pipelines',
    accountNumber: '3456',
}];

const instances: Array<Instance<Config>> = [{
    applicationConfig: {
        foo: true,
    },
    accountName: 'account1',
    branchName: 'main',
    requiresApproval: true,
}, {
    applicationConfig: {
        foo: false,
    },
    accountName: 'account2',
    branchName: 'development',
    requiresApproval: false,
}];

export const manager = new MyCdkManager();

for (const account of accounts) {
    manager.addAccount(account);
}

for (const instance of instances) {
    manager.addInstance(instance);
}

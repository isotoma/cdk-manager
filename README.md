# cdk-manager

[![GitHub license](https://img.shields.io/github/license/isotoma/cdk-manager)](https://github.com/isotoma/cdk-manager/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/cdk-manager)](https://www.npmjs.com/package/cdk-manager)
![GitHub Workflow Status (branch)](https://img.shields.io/github/actions/workflow/status/isotoma/cdk-manager/test.yaml?branch=main)

This couples together three separate, but related CDK-related tasks:

- configuration of self-hosted CDK pipelines and deploying them
- CDK bootstrapping
- setting environment variables to interact with those pipelines or
  the environments those pipelines deploy (termed here "activating")
  
## Assumed knowledge

- CDK's self-hosted pipelines: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html
- CDK bootstrapping: https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html
- Typescript, and in particular, generics: https://www.typescriptlang.org/docs/handbook/2/generics.html

## Usage and getting started

Configuration is handled by extending the `CdkManager` class and
implementing an assortment of methods to handle customisation.

```typescript
import { Account, Instance, CdkManager } from 'cdk-manager';

interface Config {
    foo: boolean;
}

class MyCdkManager extends CdkManager<Config> {
    // customisation here, see docs below
}

const accounts: Array<Account> = [{
    name: 'account1',
    accountNumber: '1234',
}, {
    name: 'account2',
    accountNumber: '5678',
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
```

## Methods expected to be overridden

No methods are private, so any could be overridden if needed, but
below is a list of the methods that likely need to be overridden.

Note also that the base `CdkManager` class is not `abstract`, so
strictly, no methods need to be overridden, but some base
implementations just throw an `Error`. This is by design as it allows,
say, use of the pipelines-based features without requiring
implementation of the methods for the bootstrapping features.

When implementing these methods yourself, you should replace `A` with
the type parameter passed to `CdkManager`, eg `Config` in the sample
above.

### `addPipelineCdkStack(app: cdk.App, account: Account, instance: Instance<A>): cdk.Stack`

This is expected to be a subclass of `cdk-manager.PipelineStack` to
allow for the self-hosted pipeline behaviour. See below.

### `getPipelineStackName(account: Account, instance: Instance<A>): string`

Return the name of the pipeline stack, based on the account and the instance.

### `async getExtraActivationEnvironmentVariables(envVars: EnvironmentVariables, account: Account, instance?: Instance<A>): Promise<EnvironmentVariables>`

Return any additional env-vars to be set when activating. This method
is `async` to allow things like downloading executables, saving them
to a directory and putting that directory in `PATH`.

### `getActivationDefaultAccountName(): string`

The name of the account to activate if none is selected via command
line flag.

### `getDefaultBootstrapDeploymentProfile(account: Account): string`

Default AWS profile to use when bootstrapping.

### `getDefaultPipelineDeploymentProfile(account: Account, instance?: Instance<A>): string`

Default AWS profile to use when deploying pipelines.

### `getDefaultInstanceProfile(account: Account, instance: Instance<A>): string`

Default AWS profile to use when activating an instance.

### `getDefaultPipelineDeploymentRegion(account: Account, instance?: Instance<A>): string`

Default AWS region to use when deploying pipelines.

### `getDefaultInstanceRegion(account: Account, instance: Instance<A>): string`

Default AWS region to use when activating an instance.

## `Account`

| Property                           | Type       | Required?        | Notes                                              |
|------------------------------------|------------|------------------|----------------------------------------------------|
| `name`                             | `string`   | Yes              | A meaningful and unique identifier                 |
| `accountNumber`                    | `string`   | Yes              | The AWS account number                             |
| `cdkBootstrap.enabled`             | `boolean`  | No               | Whether to apply CDK bootstrapping to this account |
| `cdkBootstrap.regions`             | `string[]` | Yes if `enabled` | List of regions to bootstrap                       |
| `cdkBootstrap.minimumVersion`      | `number`   | Yes if `enabled` | Minimum required CDK bootstrap version             |
| `cdkBootstrap.trustedAccountNames` | `string[]` | Yes if `enabled` | List of account names to be trusted                |

## `Instance<A>`

| Property             | Type             | Required?             | Notes                                                                        |
|----------------------|------------------|-----------------------|------------------------------------------------------------------------------|
| `applicationConfig`  | `A`              | Yes                   | The config you need to configure whatever you are deploying                  |
| `accountName`        | `string`         | Yes                   | The target account for deployment                                            |
| `requiresApproval`   | `boolean`        | Yes                   | See https://docs.aws.amazon.com/codepipeline/latest/userguide/approvals.html |
| `suffix`             | `string`         | No                    | Suffix to prevent name collisions                                            |
| `branchName`         | `string`         | Yes, unless sequenced | Source branch for the pipeline                                               |
| `sequencedInstances` | `SubInstance<A>` | No                    | Instances to be deployed sequentially before this instance                   |

## Pipeline stack

If using the self-hosted pipeline feature, extend `PipelineStack` and
return it in your `CdkManager.addPipelineCdkStack`.

### Expected methods to be overridden

#### `getSourceConnection(accountConfig: Account, pipelineConfig: Instance<A>): pipelines.IFileSetProducer`

This is expected to reference the source repository, eg using
https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines.CodePipelineSource.html.

#### `getInstallCommands(accountConfig: Account, pipelineConfig: Instance<A>): Array<string>`

Shell commands to run to install dependencies in the pipeline. These
commands will be run relative to the root of the repository.

Eg, running `npm ci`.

Recommend referencing a script file, eg `pipeline_hooks/install.sh`,
and putting the command in that file in your repo. This way if you
push a change that changes these commands, the new commands will be
run immediately and no pipeline self-mutate required. This is better
than first running the old commands (as they are "baked into" the
pipeline), then self-mutate updating the pipeline (assuming it
worked), then the pipeline looping around.

#### `getCommands(accountConfig: Account, pipelineConfig: Instance<A>): Array<string>`

Shell commands to run within the pipeline to build the pipeline
stack. Eg running `cdk synth [name of pipeline stack]`.

(For the same reasons as for `getInstallCommands`, recommend referencing a script file.)

#### `addStacksToDeploymentStage(stage: Stage, accountConfig: Account, pipelineConfig: SubInstance<A>, codeBuildContext: CodeBuildContext): void`

Add the stacks that you actually want the pipeline to deploy into the
target account.

#### `getStageProps(accountConfig: Account, pipelineConfig: SubInstance<A>): StageProps`

Props to pass to the Stage.

#### `getCodeBuildOptions(accountConfig: Account, pipelineConfig: Instance<A>): pipelines.CodeBuildOptions`

Additional CodeBuild options. See
https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines.CodeBuildOptions.html
for all possible options here.

Note that this does provide a default implementation to provide a
sufficiently recent nodejs runtime.

#### `getDockerCredentials(accountConfig: Account, pipelineConfig: SubInstance<A>): Array<pipelines.DockerCredential>`

Return Docker credentials to be used by the pipeline when building.

#### `getPipelineSynthProjectAllowedRoleArns(accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps): string[]`

To allow the CDK pipeline to perform cross-account lookups, need to
grant it permission to assume the CDK's lookup roles. The default
implementation does this, so in most cases won't need to change this.

#### `getOtherPipelineProps(accountConfig: Account, pipelineConfig: Instance<A>, stackProps: StackProps): Partial<pipelines.CodePipelineProps>`

Any other props to pass to `pipelines.CodePipeline`.

## Suffixes

An instance can have a suffix to allow multiple instances to be
deployed to the same account without name collisions.

```typescript
const instances: Array<Instance<Config>> = [{
    applicationConfig: {
        foo: true,
    },
    accountName: 'account1',
    branchName: 'dev-alice',
    suffix: 'dev-alice',
    requiresApproval: false,
}, {
    applicationConfig: {
        foo: true,
    },
    accountName: 'account1',
    branchName: 'dev-bob',
    suffix: 'dev-bob',
    requiresApproval: false,
// ...
}];

# Sequenced instances

Can also have a single pipeline that deploys multiple instances in sequence:

```typescript
const instances: Array<Instance<Config>> = [{
    applicationConfig: {
        foo: true,
    },
    accountName: 'production',
    branchName: 'production',
    requiresApproval: true,
    sequencedInstances: [{
        applicationConfig: {
            foo: true,
        },
        accountName: 'stage',
        requiresApproval: false,
    }],
// ...
}];
```

Here, the pipeline will deploy to stage. If that succeeds, will wait
for approval and will then deploy to production.

When there are multiple sequenced instances, these will be deployed in
the order they appear in `sequencedInstances`, first to last. Then the
parent instance will be deployed.

There is no support for deeper nesting of instances as these would
always get flattened in the pipeline anyway.

## Command line tools

There are three command line tools that a `CdkManager` makes
available:

- `runPipelineApplyFromArgv`, applies pipelines based on configured instances and accounts
- `runBootstrapApplyFromArgv`, applies bootstrapping based on configured accounts
- `runActivateFromArgv`, activates a selected instance and account

The examples show how to make these usable from `npm run`.

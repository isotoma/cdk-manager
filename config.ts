export interface CdkBootstrapConfigEnabled {
    enabled: true;
    regions: Array<string>;
    minimumVersion: number;
    trustedAccountNames?: Array<string>;
}

export interface CdkBootstrapConfigDisabled {
    enabled: false;
}

export interface Account {
    name: string;
    accountNumber: string;
    cdkBootstrap?: CdkBootstrapConfigEnabled | CdkBootstrapConfigDisabled;
}

// support either 16 or 18 as the version of Node
type NodeVersion = 16 | 18;

export interface SubInstance<A> {
    applicationConfig: A;
    accountName: string;
    requiresApproval: boolean;
    suffix?: string;
    nodeVersion?: NodeVersion;
}

export interface Instance<A> extends SubInstance<A> {
    applicationConfig: A;
    accountName: string;
    branchName: string;
    requiresApproval: boolean;
    suffix?: string;
    nodeVersion?: NodeVersion;
    sequencedInstances?: Array<SubInstance<A>>;
}

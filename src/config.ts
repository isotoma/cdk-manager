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

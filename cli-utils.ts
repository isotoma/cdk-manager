import type { CdkManager } from './manager';

// TODO: is there a way of making these easier to extend?
export abstract class BaseCliCommand<A, M extends CdkManager<A>> {
    public readonly manager: M;
    constructor(manager: M) {
        this.manager = manager;
    }

    abstract run(argv: Array<string>): void;
}

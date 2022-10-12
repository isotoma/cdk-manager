import { exec } from 'child_process';
import { promisify } from 'util';

export const execPromise = promisify(exec);

export type EnvironmentVariables = Record<string, string>;

export interface Command {
    command: string;
    env?: EnvironmentVariables;
}

export type CommandSet = Array<Command>;

export const envToString = (env: EnvironmentVariables): string => {
    const parts: Array<string> = [];
    for (const [key, value] of Object.entries(env)) {
        parts.push(`${key}="${value}"`);
    }
    return parts.join(' ');
};

export const commandToString = (command: Command): string => {
    if (command.env && Object.keys(command.env).length) {
        return `${envToString(command.env)} ${command.command}`;
    } else {
        return command.command;
    }
};

export const commandSetToString = (commandSet: CommandSet): string => {
    const parts = [];
    for (const command of commandSet) {
        parts.push(commandToString(command));
    }
    return parts.join(' && ');
};

export const executeCommand = async (commandSet: CommandSet): Promise<void> => {
    console.error(`Running: ${commandSetToString(commandSet)}`);
    await execPromise(commandSetToString(commandSet));
    console.error('Done');
};

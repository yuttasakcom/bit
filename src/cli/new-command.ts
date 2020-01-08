import R from 'ramda';
import format from 'string-format';
import { PositionalOptions, Options, Arguments } from 'yargs';

export type CommandOption = [string, string, string];
export type CommandOptions = Array<CommandOption>;

export interface CommandSpecialOptions {
  loader?: boolean;
  /**
   * Will hide the command from the help
   *
   * @type {boolean}
   * @memberof CommandSpecialOptions
   */
  private?: boolean;
  /**
   * Used for documentation generation
   *
   * @type {boolean}
   * @memberof CommandSpecialOptions
   */
  skipWorkspace?: boolean;
  /**
   * Used for adding the token option globally
   *
   * @type {boolean}
   * @memberof CommandSpecialOptions
   */
  remoteOp?: boolean;
  /**
   * Does this command implement the json support, if true it will add the --json option automatically
   *
   * @type {boolean}
   * @memberof CommandSpecialOptions
   */
  jsonSupport?: boolean;
  /**
   * Does this command run a migration process automatically on a new bit version
   *
   * @type {boolean}
   * @memberof CommandSpecialOptions
   */
  migration?: boolean;
}

// export type PositionalDeclaration = Record<string, PositionalOptions>;
export type PositionalDeclaration = { [key: string]: PositionalOptions };
export type OptionsDeclaration = { [key: string]: Options };

export default interface Cmd {
  name: string;
  command: string;
  description: string;
  positionals?: PositionalDeclaration;
  aliases?: ReadonlyArray<string> | string;
  opts?: OptionsDeclaration;
  commands?: Cmd[];
  specialOptions?: CommandSpecialOptions;

  handler: (args: Arguments<{}>) => Promise<any>;
  render: (data: any, args: Arguments<{}>) => string;
}

export const cmdToYargsCmd = (command: Cmd) => {
  const positional = command.positionals;
  let builder: any = command.opts || {};
  if (positional) {
    builder = yargs => {
      R.forEachObjIndexed((val, key) => {
        yargs.positional(key, val);
      }, positional);
      yargs.options(command.opts);
    };
  }
  const yargsCmd = {
    command: format(command.command, { name: command.name }),
    describe: command.description,
    builder: builder,
    handler: command.handler,
    // A workaround to be able to wrap the handler later
    _handler: command.handler
  };
  return yargsCmd;
};

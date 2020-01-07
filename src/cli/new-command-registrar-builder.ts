import R from 'ramda';
import CommandRegistrar from './new-command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION, BIT_EPILOGUE } from '../constants';
import { Commands } from '../extensions/extension';
import Init from './commands/public-cmds/new-init-cmd';

export const commands = {
  init: Init
};

export default function registerCommands(extensionsCommands: Array<Commands>): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_EPILOGUE, R.values(commands), extensionsCommands);
}

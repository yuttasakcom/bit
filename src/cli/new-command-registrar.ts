import { serializeError } from 'serialize-error';
import R from 'ramda';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import yargs from 'yargs';
import chalk from 'chalk';
import didYouMean from 'didyoumean';
import Command, { cmdToYargsCmd } from './new-command';
import { Commands } from '../extensions/extension';
import { migrate } from '../api/consumer';
import defaultHandleError from './default-error-handler';
import { empty, camelCase, first, isNumeric, buildCommandMessage, packCommand } from '../utils';
import loader from './loader';
import logger from '../logger/logger';
import { Analytics } from '../analytics/analytics';
import { TOKEN_FLAG, TOKEN_FLAG_NAME } from '../constants';
import globalFlags from './global-flags';

didYouMean.returnFirstMatch = true;

function logAndExit(msg: string, commandName, code = 0) {
  process.stdout.write(`${msg}\n`, () => logger.exitAfterFlush(code, commandName));
}

function logErrAndExit(msg: Error | string, commandName: string) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (msg.code) throw msg;
  console.error(msg); // eslint-disable-line
  logger.exitAfterFlush(1, commandName);
}

function parseSubcommandFromArgs(args: [any]) {
  if (typeof first(args) === 'string') return first(args);
  return null;
}

function parseCommandName(commandName: string): string {
  if (!commandName) return '';
  return first(commandName.split(' '));
}

function getOpts(c, opts: [[string, string, string]]): { [key: string]: boolean | string } {
  const options = {};

  opts.forEach(([, name]) => {
    const parsedName = parseCommandName(name);
    const camelCaseName = camelCase(parsedName);

    if (name.startsWith('no-')) {
      // from commander help: "Note that multi-word options starting with --no prefix negate the boolean value of the following word. For example, --no-sauce sets the value of program.sauce to false."
      // we don't want this feature, so we do the opposite action.
      options[camelCaseName] = !c[camelCase(parsedName.replace('no-', ''))];
    } else {
      options[camelCaseName] = c[camelCaseName];
    }
  });

  return options;
}

function execAction(command, concrete, args) {
  const flags = getOpts(concrete, command.opts);
  const relevantArgs = args.slice(0, args.length - 1);
  const packageManagerArgs = concrete.parent.packageManagerArgs;
  Analytics.init(concrete.name(), flags, relevantArgs, concrete.parent._version);
  logger.info(`[*] started a new command: "${command.name}" with the following data:`, {
    args: relevantArgs,
    flags,
    packageManagerArgs
  });
  if (command.loader) {
    loader.on();
  }
  if (flags[TOKEN_FLAG_NAME]) {
    globalFlags.token = flags[TOKEN_FLAG_NAME].toString();
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (flags.json) {
    loader.off();
    logger.shouldWriteToConsole = false;
  }
  const migrateWrapper = (run: boolean) => {
    if (run) {
      logger.debug('Checking if a migration is needed');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return migrate(null, false);
    }
    return Promise.resolve();
  };

  migrateWrapper(command.migration)
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    .then(() => {
      return command.action(relevantArgs, flags, packageManagerArgs).then(res => {
        loader.off();
        let data = res;
        let code = 0;
        if (res && res.__code !== undefined) {
          data = res.data;
          code = res.__code;
        }
        return logAndExit(command.report(data, relevantArgs, flags), command.name, code);
      });
    })
    .catch(err => {
      logger.error(
        `got an error from command ${command.name}: ${err}. Error serialized: ${JSON.stringify(
          err,
          Object.getOwnPropertyNames(err)
        )}`
      );
      loader.off();
      const errorHandled = defaultHandleError(err) || command.handleError(err);

      if (command.private) return serializeErrAndExit(err, command.name);
      if (!command.private && errorHandled) return logErrAndExit(errorHandled, command.name);
      return logErrAndExit(err, command.name);
    });
}

function serializeErrAndExit(err, commandName) {
  process.stderr.write(packCommand(buildCommandMessage(serializeError(err), undefined, false), false, false));
  const code = err.code && isNumeric(err.code) ? err.code : 1;
  return logger.exitAfterFlush(code, commandName);
}

function register(command: Command, yargsIns) {
  const yargsCmd = yargsIns.command(cmdToYargsCmd(command));

  // TODO: add this
  // if (command.remoteOp) {
  //   command.opts.push(['', TOKEN_FLAG, 'authentication token']);
  // }

  if (command.commands) {
    command.commands.forEach(nestedCmd => {
      register(nestedCmd, yargsCmd);
    });
  }
}

export default class CommandRegistrar {
  constructor(
    public usage: string,
    public description: string,
    public epilogue: string,
    public commands: Command[],
    public extensionsCommands: Command[]
  ) {}
  registerBaseCommand() {
    yargs
      .version()
      .usage(this.usage, this.description)
      .epilogue(this.epilogue);
  }

  registerCommands() {
    this.commands.forEach(cmd => register(cmd, yargs));
  }

  registerExtenstionsCommands() {
    this.extensionsCommands.forEach(cmd => register(cmd, commander));
  }

  printHelp() {
    // eslint-disable-next-line global-require
    const helpTemplateGenerator = require('./templates/help');
    console.log(helpTemplateGenerator(this.extensionsCommands)); // eslint-disable-line no-console
    return this;
  }

  outputHelp() {
    const args = process.argv.slice(2);
    if (!args.length) {
      // @TODO replace back to commander help and override help method
      // commander.help();
      this.printHelp();
      return this;
    }

    const subcommand = args[0];
    const cmdList = this.commands.map(cmd => first(cmd.name.split(' ')));
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const extensionsCmdList = this.extensionsCommands.map(cmd => first(cmd.name.split(' ')));
    const aliasList = this.commands.map(cmd => first(cmd.alias.split(' ')));

    if (
      !cmdList.includes(subcommand) &&
      !extensionsCmdList.includes(subcommand) &&
      !aliasList.includes(subcommand) &&
      subcommand !== '-V' &&
      subcommand !== '--version'
    ) {
      process.stdout.write(
        chalk.yellow(
          `warning: '${chalk.bold(subcommand)}' is not a valid command.\nsee 'bit --help' for additional information.\n`
        )
      );
      const suggestion = didYouMean(subcommand, commander.commands.filter(c => !c._noHelp).map(cmd => cmd._name));
      if (suggestion) {
        const match = typeof suggestion === 'string' ? suggestion : suggestion[0];
        console.log(chalk.red(`Did you mean ${chalk.bold(match)}?`)); // eslint-disable-line no-console
      }
      return this;
    }

    return this;
  }

  run() {
    const [params, packageManagerArgs] = R.splitWhen(R.equals('--'), process.argv);
    packageManagerArgs.shift(); // the first item, '--', is not needed.
    this.registerBaseCommand();
    this.registerCommands();
    // this.registerExtenstionsCommands();
    // this.outputHelp();
    // commander.packageManagerArgs = packageManagerArgs; // it's a hack, I didn't find a better way to pass them
    // commander.parse(params);
    yargs.parse();
    return this;
  }
}

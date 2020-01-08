import { serializeError } from 'serialize-error';
import R from 'ramda';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import yargs, { MiddlewareFunction, Arguments } from 'yargs';
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

async function logAndExit(msg: string, commandName, code = 0) {
  process.stdout.write(`${msg}\n`, () => logger.exitAfterFlush(code, commandName));
  // process.stdout.write(`${msg}\n`);
  // return logger.exitAfterFlush(code, commandName);
}

function logErrAndExit(msg: Error | string, commandName: string) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (msg.code) throw msg;
  console.error(msg); // eslint-disable-line
  logger.exitAfterFlush(1, commandName);
}

function serializeErrAndExit(err, commandName) {
  process.stderr.write(packCommand(buildCommandMessage(serializeError(err), undefined, false), false, false));
  const code = err.code && isNumeric(err.code) ? err.code : 1;
  return logger.exitAfterFlush(code, commandName);
}

/**
 * Wrap the handler of the command to support specialOptions such as loader, migration and token
 *
 * @param {(args: Arguments<{}>) => Promise<any>} handler
 * @returns {(args: Arguments<{}>) => Promise<any>}
 */
function wrapHandler(command: Command): (args: Arguments<{}>) => Promise<any> {
  if (R.path(['specialOptions', 'loader'], command)) {
    loader.on();
  }
  const origHandler = command.handler;
  const handler = async (args: Arguments<{}>) => {
    const token = args[TOKEN_FLAG_NAME];
    if (typeof token === 'string') {
      globalFlags.token = token;
    }
    if (args.json) {
      loader.off();
      logger.shouldWriteToConsole = false;
    }
    const runMigration = R.path(['specialOptions', 'migration'], command);
    const migrationP = runMigration ? migrate() : Promise.resolve();
    await migrationP;
    return origHandler(args);
  };
  return handler;
}

function register(command: Command, yargsIns) {
  command.handler = wrapHandler(command);
  const yargsCmd = yargsIns.command(cmdToYargsCmd(command)).onFinishCommand(async resultValue => {
    console.log('finished with ', resultValue);
    loader.off();
    let data = resultValue;
    let code = 0;
    if (resultValue && resultValue.__code !== undefined) {
      data = resultValue.data;
      code = resultValue.__code;
    }
    await logAndExit(command.render(data, yargsIns.argv), command.command, code);
    console.log('register after');
    // process.exit()
  });

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
    public middlewares: MiddlewareFunction[],
    public commands: Command[],
    public extensionsCommands: Command[]
  ) {}
  config() {
    yargs
      .parserConfiguration({ 'boolean-negation': false })
      .recommendCommands()
      .wrap(yargs.terminalWidth());
  }

  registerBaseCommand() {
    yargs
      .version()
      .usage(this.usage, this.description)
      .epilogue(this.epilogue);
  }

  registerMiddlewares() {
    yargs.middleware(this.middlewares);
  }

  registerCommands() {
    this.commands.forEach(cmd => register(cmd, yargs));
  }

  registerFail() {
    yargs.fail((msg, err, yargs) => {
      console.log('on fail');
      console.log('msg', msg);
      console.log('err', err);
      // logger.error(
      //   `got an error from command ${command.name}: ${err}. Error serialized: ${JSON.stringify(
      //     err,
      //     Object.getOwnPropertyNames(err)
      //   )}`
      // );
      // loader.off();
      // const errorHandled = defaultHandleError(err) || command.handleError(err);

      // if (command.private) return serializeErrAndExit(err, command.name);
      // if (!command.private && errorHandled) return logErrAndExit(errorHandled, command.name);
      // return logErrAndExit(err, command.name);
    });
  }

  registerExtenstionsCommands() {
    this.extensionsCommands.forEach(cmd => register(cmd, yargs));
  }

  printHelp() {
    // eslint-disable-next-line global-require
    const helpTemplateGenerator = require('./templates/help');
    console.log(helpTemplateGenerator(this.extensionsCommands)); // eslint-disable-line no-console
    return this;
  }

  run() {
    const [params, packageManagerArgs] = R.splitWhen(R.equals('--'), process.argv);
    packageManagerArgs.shift(); // the first item, '--', is not needed.
    this.config();
    this.registerBaseCommand();
    this.registerMiddlewares();
    this.registerCommands();
    this.registerFail();
    // this.registerExtenstionsCommands();
    // this.outputHelp();
    // commander.packageManagerArgs = packageManagerArgs; // it's a hack, I didn't find a better way to pass them
    // commander.parse(params);
    // yargs.parse();
    yargs.argv;
    return this;
  }
}

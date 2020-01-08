import loader from './loader';
import logger from '../logger/logger';

export function analyticsMiddleware(argv) {
  console.log('run analytics middleware - TODO');
}

// Done in the action itself since it needs to check the command.specialOptions.loader which
// is not available during the middleware
// export function loaderMiddleware(argv) {}

export function jsonMiddleware(argv) {
  loader.off();
  logger.shouldWriteToConsole = false;
}

// Done in the action itself since it needs to check the command.specialOptions.migration which
// is not available during the middleware
// export function migrationMiddleware(argv) {}

export function loggerMiddleware(argv, yargs) {
  const name = argv._.join(' ');
  logger.info(`[*] started a new command: "${name}" with the following data:`, {
    args: argv
  });
}

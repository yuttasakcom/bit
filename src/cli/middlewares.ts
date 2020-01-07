import loader from './loader';
import logger from '../logger/logger';

export function analyticsMiddleware(argv) {
  console.log('run analytics middleware');
}

export function loaderMiddleware(argv) {
  console.log('run loaderMiddleware');
}

export function jsonMiddleware(argv) {
  loader.off();
  logger.shouldWriteToConsole = false;
  console.log('run jsonMiddleware');
}

export function migrationMiddleware(argv) {
  console.log('run migrationMiddleware');
}

export function loggerMiddleware(argv) {
  console.log('run loggerMiddleware');
}

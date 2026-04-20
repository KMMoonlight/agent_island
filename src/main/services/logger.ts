import log from 'electron-log';

log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
log.transports.console.level = false;

export const logger = log;

/**
 * Simple logger utility
 */
export class Logger {
  constructor(context = '') {
    this.context = context;
  }

  log(message, meta = {}) {
    console.log(`[${new Date().toISOString()}] [${this.context}] [LOG] ${message}`, meta);
  }

  error(message, error = {}) {
    console.error(`[${new Date().toISOString()}] [${this.context}] [ERROR] ${message}`, error);
  }

  warn(message, meta = {}) {
    console.warn(`[${new Date().toISOString()}] [${this.context}] [WARN] ${message}`, meta);
  }

  debug(message, meta = {}) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(`[${new Date().toISOString()}] [${this.context}] [DEBUG] ${message}`, meta);
    }
  }
}

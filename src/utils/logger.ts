export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? LogLevel.INFO,
      prefix: config.prefix ?? '[Vector]',
      timestamp: config.timestamp ?? true,
    };
  }

  private formatMessage(level: string, message: string): string {
    const parts: string[] = [];

    if (this.config.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }

    parts.push(`[${level}]`);
    parts.push(message);

    return parts.join(' ');
  }

  debug(message: string, ...args: any[]): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.config.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.config.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  error(message: string, error?: Error): void {
    if (this.config.level <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message));
      if (error) {
        console.error(error.stack || error.message);
      }
    }
  }

  success(message: string): void {
    console.log(`✅ ${message}`);
  }

  loading(message: string): void {
    console.log(`⏳ ${message}`);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

export const logger = new Logger({
  level: process.env.LOG_LEVEL
    ? (LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] ?? LogLevel.INFO)
    : LogLevel.INFO,
  timestamp: process.env.NODE_ENV !== 'production',
});

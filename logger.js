import { config } from './config.js';

export class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      success: 2,
      debug: 3
    };
    this.level = 'info';
    this.timezone = config.timezone || 'UTC';
    
    // ANSI colors
    this.colors = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m'
    };
  }

  colorize(text, color) {
    return `${this.colors[color]}${text}${this.colors.reset}`;
  }

  log(level, message, ...args) {
    if (this.levels[level] <= this.levels[this.level]) {
      const now = new Date();
      const timestamp = now.toLocaleTimeString('en-US', {
        timeZone: this.timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      // Color based on level
      let color = 'reset';
      let prefixColor = 'gray';
      
      switch (level) {
        case 'error':
          color = 'red';
          prefixColor = 'red';
          break;
        case 'warn':
          color = 'yellow';
          prefixColor = 'yellow';
          break;
        case 'success':
          color = 'green';
          prefixColor = 'green';
          break;
        case 'debug':
          color = 'gray';
          prefixColor = 'gray';
          break;
        default:
          color = 'cyan';
          prefixColor = 'gray';
      }
      
      const coloredPrefix = this.colorize(`[${timestamp}]`, prefixColor);
      const coloredMessage = this.colorize(message, color);
      
      if (args.length > 0) {
        console.log(coloredPrefix, coloredMessage, ...args);
      } else {
        console.log(coloredPrefix, coloredMessage);
      }
    }
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  success(message, ...args) {
    this.log('success', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }
}

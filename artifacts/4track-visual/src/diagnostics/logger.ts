/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'AUDIT';
export type LogCategory = 'DECODER' | 'DSP' | 'SCHEDULER' | 'RENDERER' | 'SYSTEM';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  timeMs: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown> | string;
}

export interface AuditStepResult {
  step: string;
  passed: boolean;
  durationMs: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuditSuiteResult {
  timestamp: string;
  allPassed: boolean;
  totalDurationMs: number;
  steps: AuditStepResult[];
}

type LogListener = (logs: DiagnosticLogEntry[]) => void;

class DiagnosticLogger {
  private logs: DiagnosticLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 300;
  private logIdCounter = 0;

  constructor() {
    // Intercept unhandled window errors and promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.log('ERROR', 'SYSTEM', `Unhandled window error: ${event.message}`, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error ? String(event.error.stack || event.error) : null,
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        this.log('ERROR', 'SYSTEM', `Unhandled Promise Rejection: ${reason?.message || String(reason)}`, {
          stack: reason?.stack || null,
        });
      });
    }
  }

  public log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    details?: Record<string, unknown> | string
  ) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

    const entry: DiagnosticLogEntry = {
      id: `log_${++this.logIdCounter}`,
      timestamp: timeStr,
      timeMs: performance.now(),
      level,
      category,
      message,
      details,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output for standard browser devtools
    const prefix = `[${entry.timestamp}] [${category}] [${level}]`;
    if (level === 'ERROR') {
      console.error(prefix, message, details || '');
    } else if (level === 'WARN') {
      console.warn(prefix, message, details || '');
    } else if (level === 'AUDIT') {
      console.info(`%c${prefix} ${message}`, 'color: #00ffff; font-weight: bold;', details || '');
    } else {
      console.log(prefix, message, details || '');
    }

    this.notify();
  }

  public info(category: LogCategory, message: string, details?: Record<string, unknown> | string) {
    this.log('INFO', category, message, details);
  }

  public success(category: LogCategory, message: string, details?: Record<string, unknown> | string) {
    this.log('SUCCESS', category, message, details);
  }

  public warn(category: LogCategory, message: string, details?: Record<string, unknown> | string) {
    this.log('WARN', category, message, details);
  }

  public error(category: LogCategory, message: string, details?: Record<string, unknown> | string) {
    this.log('ERROR', category, message, details);
  }

  public audit(message: string, details?: Record<string, unknown> | string) {
    this.log('AUDIT', 'SYSTEM', message, details);
  }

  public getLogs(): DiagnosticLogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.getLogs());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const current = this.getLogs();
    this.listeners.forEach((fn) => fn(current));
  }

  public exportJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        totalLogs: this.logs.length,
        logs: this.logs,
      },
      null,
      2
    );
  }
}

export const logger = new DiagnosticLogger();

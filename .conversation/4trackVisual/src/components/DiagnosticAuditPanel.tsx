/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Terminal,
  Play,
  RotateCcw,
  Copy,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { logger, DiagnosticLogEntry, AuditSuiteResult } from '../diagnostics/logger';
import { runSystemAudit, generateFourDemoStems } from '../diagnostics/auditRunner';
import { TrackData } from '../types';

interface DiagnosticAuditPanelProps {
  onLoadSyntheticStems?: (tracks: TrackData[]) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const DiagnosticAuditPanel: React.FC<DiagnosticAuditPanelProps> = ({
  onLoadSyntheticStems,
  isOpen,
  onToggle,
}) => {
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditSuiteResult | null>(null);
  const [isGeneratingStems, setIsGeneratingStems] = useState(false);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleRunAudit = async () => {
    setIsRunningAudit(true);
    try {
      const res = await runSystemAudit();
      setAuditResult(res);
    } catch (err) {
      logger.error('SYSTEM', 'Self-audit threw unexpected top-level error', {
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRunningAudit(false);
    }
  };

  const handleLoadDemoStems = async () => {
    if (!onLoadSyntheticStems) return;
    setIsGeneratingStems(true);
    try {
      logger.info('SYSTEM', 'Synthesizing 4 demo tracks...');
      const demoTracks = await generateFourDemoStems();
      onLoadSyntheticStems(demoTracks);
      logger.success('SYSTEM', 'Loaded 4 synthesized stems into visualizer engine!');
    } catch (err) {
      logger.error('SYSTEM', 'Failed to generate demo stems', {
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsGeneratingStems(false);
    }
  };

  const handleCopyLogs = () => {
    const text = logger.exportJson();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const jsonStr = logger.exportJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio_visualizer_audit_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter((entry) => {
    if (filterLevel !== 'ALL' && entry.level !== filterLevel) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchMsg = entry.message.toLowerCase().includes(q);
      const matchCat = entry.category.toLowerCase().includes(q);
      return matchMsg || matchCat;
    }
    return true;
  });

  const errorCount = logs.filter((l) => l.level === 'ERROR').length;
  const warnCount = logs.filter((l) => l.level === 'WARN').length;

  return (
    <div className="bg-[#0c0d12] border-t border-neutral-800 shadow-2xl transition-all duration-300">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800/80 bg-neutral-950/70">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className="flex items-center gap-2 text-xs font-mono font-bold text-neutral-200 hover:text-cyan-400 transition-colors"
          >
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>DIAGNOSTICS & SYSTEM AUDIT</span>
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Error & Warning Badges */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            {errorCount > 0 ? (
              <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-800 flex items-center gap-1 font-bold">
                <AlertTriangle className="w-3 h-3" />
                {errorCount} {errorCount === 1 ? 'ERROR' : 'ERRORS'}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                0 ERRORS
              </span>
            )}

            {warnCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/60">
                {warnCount} WARN
              </span>
            )}

            <span className="text-neutral-500">{logs.length} LOGS RECORDED</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAudit}
            disabled={isRunningAudit}
            className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/80 text-cyan-300 rounded text-[11px] font-mono font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Run 5-stage automated self-test across AudioContext, DSP, Scheduler, and Canvas"
          >
            {isRunningAudit ? (
              <RotateCcw className="w-3 h-3 animate-spin text-cyan-300" />
            ) : (
              <Activity className="w-3 h-3 text-cyan-300" />
            )}
            <span>{isRunningAudit ? 'AUDITING...' : 'RUN SELF-AUDIT'}</span>
          </button>

          {onLoadSyntheticStems && (
            <button
              onClick={handleLoadDemoStems}
              disabled={isGeneratingStems}
              className="px-2.5 py-1 bg-purple-950/80 hover:bg-purple-900 border border-purple-700/80 text-purple-200 rounded text-[11px] font-mono font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Instantly generate and mount 4 synthesized demo stems to test multi-track visualizer without files"
            >
              <Sparkles className="w-3 h-3 text-purple-300" />
              <span>{isGeneratingStems ? 'GENERATING...' : 'LOAD 4 DEMO STEMS'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content Area */}
      {isOpen && (
        <div className="p-4 space-y-4 max-h-[380px] flex flex-col">
          {/* Audit Results Banner (if run) */}
          {auditResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono ${
                auditResult.allPassed
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                  : 'bg-red-950/50 border-red-800 text-red-200'
              }`}
            >
              <div className="flex items-center justify-between font-bold mb-2 pb-1.5 border-b border-white/10">
                <span className="flex items-center gap-2">
                  {auditResult.allPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span>
                    SYSTEM SELF-AUDIT RESULTS:{' '}
                    {auditResult.allPassed ? 'ALL 5 STAGES HEALTHY (100% PASS)' : 'SYSTEM ANOMALY DETECTED'}
                  </span>
                </span>
                <span className="text-neutral-400">{auditResult.totalDurationMs.toFixed(1)}ms total</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {auditResult.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border text-[11px] ${
                      step.passed
                        ? 'bg-emerald-900/20 border-emerald-700/50 text-emerald-300'
                        : 'bg-red-900/40 border-red-700 text-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold mb-1">
                      <span className="truncate">{step.step}</span>
                      <span>{step.passed ? '✓' : '✗'}</span>
                    </div>
                    <p className="text-[10px] text-neutral-300 leading-tight line-clamp-2">
                      {step.message}
                    </p>
                    <span className="text-[9px] text-neutral-400 block mt-1">
                      {step.durationMs.toFixed(1)}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls bar: filter, search, copy, clear */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500">FILTER:</span>
              {['ALL', 'ERROR', 'WARN', 'AUDIT', 'SUCCESS', 'INFO'].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setFilterLevel(lvl)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    filterLevel === lvl
                      ? 'bg-cyan-500 text-black font-bold'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Search log messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 placeholder-neutral-500 text-[11px] focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyLogs}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] flex items-center gap-1 transition-colors"
                title="Copy all logs as JSON to clipboard"
              >
                <Copy className="w-3 h-3" />
                <span>{copied ? 'COPIED!' : 'COPY'}</span>
              </button>

              <button
                onClick={handleDownloadLogs}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] flex items-center gap-1 transition-colors"
                title="Download diagnostic log report as JSON file"
              >
                <Download className="w-3 h-3" />
                <span>JSON</span>
              </button>

              <button
                onClick={() => logger.clearLogs()}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-red-300 rounded text-[11px] flex items-center gap-1 transition-colors"
                title="Clear current log buffer"
              >
                <Trash2 className="w-3 h-3" />
                <span>CLEAR</span>
              </button>
            </div>
          </div>

          {/* Log Stream Terminal */}
          <div
            ref={logContainerRef}
            className="flex-1 overflow-y-auto bg-neutral-950 rounded-lg p-3 font-mono text-[11px] space-y-1 border border-neutral-800/80 min-h-[160px] max-h-[220px]"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-neutral-500 italic py-6 text-center">
                No logs matching filter. Trigger an audio upload, play stems, or run self-audit.
              </div>
            ) : (
              filteredLogs.map((entry) => {
                let badgeColor = 'text-neutral-400 bg-neutral-800/50';
                let textColor = 'text-neutral-300';
                let Icon = Info;

                if (entry.level === 'ERROR') {
                  badgeColor = 'text-red-400 bg-red-950 border border-red-800';
                  textColor = 'text-red-200 font-semibold';
                  Icon = XCircle;
                } else if (entry.level === 'WARN') {
                  badgeColor = 'text-amber-400 bg-amber-950/60 border border-amber-800';
                  textColor = 'text-amber-200';
                  Icon = AlertTriangle;
                } else if (entry.level === 'AUDIT') {
                  badgeColor = 'text-cyan-300 bg-cyan-950 border border-cyan-800';
                  textColor = 'text-cyan-200 font-semibold';
                  Icon = Activity;
                } else if (entry.level === 'SUCCESS') {
                  badgeColor = 'text-emerald-400 bg-emerald-950/80 border border-emerald-800';
                  textColor = 'text-emerald-200';
                  Icon = CheckCircle2;
                }

                return (
                  <div key={entry.id} className="flex items-start gap-2 leading-relaxed py-0.5 hover:bg-neutral-900/50 px-1 rounded">
                    <span className="text-neutral-500 shrink-0 text-[10px] select-none">
                      {entry.timestamp}
                    </span>
                    <span className={`px-1 py-0.2 rounded text-[9px] uppercase font-bold shrink-0 ${badgeColor}`}>
                      {entry.category}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={`${textColor} break-words`}>{entry.message}</span>
                      {entry.details && (
                        <pre className="text-[10px] text-neutral-400 mt-0.5 overflow-x-auto bg-black/40 p-1 rounded">
                          {typeof entry.details === 'string'
                            ? entry.details
                            : JSON.stringify(entry.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

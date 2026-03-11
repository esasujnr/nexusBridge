import React, { useEffect, useMemo, useState } from 'react';
import { EVENTS as js_event } from '../../js/js_eventList.js';
import { js_eventEmitter } from '../../js/js_eventEmitter.js';
import { js_andruavAuth } from '../../js/js_andruav_auth.js';
import {
  fn_opsHealthSnapshot,
  fn_opsHealthClearHistory,
} from '../../js/js_ops_health.js';
import {
  fn_retryConnectionNow,
  fn_cancelConnectionRetry,
  fn_recoverAllTelemetry,
} from '../../js/js_main.js';
import {
  fn_missionIntegritySnapshot,
} from '../../js/js_mission_integrity.js';

function fn_stateClass(state) {
  switch (state) {
    case 'connected':
    case 'ok':
    case 'active':
      return 'is-ok';

    case 'connecting':
    case 'retrying':
    case 'recovering':
    case 'degraded':
      return 'is-warn';

    case 'failed':
    case 'error':
    case 'inactive':
    case 'disconnected':
      return 'is-bad';

    default:
      return 'is-idle';
  }
}

function fn_levelClass(level) {
  switch (level) {
    case 'error':
      return 'is-error';
    case 'warn':
      return 'is-warn';
    default:
      return 'is-info';
  }
}

function fn_formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false });
  } catch {
    return '--:--:--';
  }
}

function ClssOpsHealthPanel() {
  const fn_getInitialCollapsed = () => {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      return window.localStorage.getItem('nb-ops-health-collapsed') === '1';
    } catch {
      return false;
    }
  };

  const [snapshot, setSnapshot] = useState(() => fn_opsHealthSnapshot());
  const [busyRetry, setBusyRetry] = useState(false);
  const [busyRecover, setBusyRecover] = useState(false);
  const [busyCancel, setBusyCancel] = useState(false);
  const [selectedPartyID, setSelectedPartyID] = useState('all');
  const [isCollapsed, setIsCollapsed] = useState(fn_getInitialCollapsed);

  useEffect(() => {
    const listener = {
      id: 'ops-health-panel',
    };

    const onUpdate = (me, nextSnapshot) => {
      setSnapshot(nextSnapshot || fn_opsHealthSnapshot());
    };

    js_eventEmitter.fn_subscribe(js_event.EE_opsHealthUpdated, listener, onUpdate);
    setSnapshot(fn_opsHealthSnapshot());

    return () => {
      js_eventEmitter.fn_unsubscribe(js_event.EE_opsHealthUpdated, listener);
    };
  }, []);

  const canControl = js_andruavAuth.fn_do_canControl();
  const auth = snapshot?.global?.auth || {};
  const ws = snapshot?.global?.ws || {};
  const udp = snapshot?.global?.udp || {};
  const video = snapshot?.global?.video || {};
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  const unitRows = useMemo(() => {
    const units = snapshot?.units || {};
    return Object.keys(units).map((partyID) => ({
      partyID,
      unitName: units[partyID]?.unitName || partyID,
      wsRetryCount: units[partyID]?.ws?.attempt || 0,
      wsRetryMax: units[partyID]?.ws?.maxAttempts || 0,
      udpRetryCount: units[partyID]?.udp?.retryCount || 0,
      udpRetryMax: units[partyID]?.udp?.retryMax || 0,
    }));
  }, [snapshot]);

  const filteredHistory = useMemo(() => {
    const rows = Array.isArray(snapshot?.history) ? snapshot.history : [];
    if (selectedPartyID === 'all') return rows;
    return rows.filter((entry) => String(entry.partyID || '') === String(selectedPartyID));
  }, [snapshot, selectedPartyID]);

  const chips = [
    {
      key: 'auth',
      title: 'Auth',
      state: auth.state || 'idle',
      detail: `${auth.detail || '-'} | role:${js_andruavAuth.fn_getRole()}`,
    },
    {
      key: 'ws',
      title: 'WS',
      state: ws.state || 'disconnected',
      detail: ws.detail || (ws.attempt ? `attempt ${ws.attempt}/${ws.maxAttempts || '?'}` : '-'),
    },
    {
      key: 'udp',
      title: 'UDP',
      state: udp.state || 'idle',
      detail: udp.detail || '-',
    },
    {
      key: 'video',
      title: 'Video',
      state: video.state || 'idle',
      detail: video.detail || '-',
    },
  ];

  const onRetryWs = async () => {
    if (busyRetry) return;
    setBusyRetry(true);
    try {
      await fn_retryConnectionNow();
    } finally {
      setBusyRetry(false);
    }
  };

  const onRecoverUdp = () => {
    if (busyRecover) return;
    setBusyRecover(true);
    try {
      fn_recoverAllTelemetry();
    } finally {
      setTimeout(() => setBusyRecover(false), 300);
    }
  };

  const onCancelRetry = () => {
    if (busyCancel) return;
    setBusyCancel(true);
    try {
      fn_cancelConnectionRetry();
    } finally {
      setTimeout(() => setBusyCancel(false), 250);
    }
  };

  const onExportDiagnostics = () => {
    const missionSnapshot = fn_missionIntegritySnapshot();
    const traceId = history.find((entry) => !!entry.traceId)?.traceId || null;
    const bundle = {
      generatedAt: new Date().toISOString(),
      traceId: traceId,
      role: js_andruavAuth.fn_getRole(),
      filter: {
        partyID: selectedPartyID,
      },
      global: snapshot?.global || {},
      units: snapshot?.units || {},
      missionIntegrity: missionSnapshot?.units || {},
      history: filteredHistory,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const safeParty = selectedPartyID === 'all' ? 'all' : selectedPartyID;
    const filename = `nexus_diagnostics_${safeParty}_${Date.now()}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const onToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('nb-ops-health-collapsed', next ? '1' : '0');
        }
      } catch {
        return next;
      }
      return next;
    });
  };

  return (
    <div className="ops-health-panel" id="ops_health_panel">
      <div className="ops-health-header">
        <span>Ops Health</span>
        <button
          type="button"
          className="btn btn-sm ops-health-collapse-btn"
          onClick={onToggleCollapse}
          aria-expanded={isCollapsed !== true}
          aria-label={isCollapsed ? 'Expand Ops Health panel' : 'Collapse Ops Health panel'}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <span className={`bi bi-chevron-down ops-health-collapse-icon ${isCollapsed ? 'is-collapsed' : ''}`} aria-hidden="true"></span>
        </button>
      </div>

      {isCollapsed !== true && (
        <>
          <div className="ops-health-grid">
            {chips.map((chip) => (
              <div key={chip.key} className={`ops-health-chip ${fn_stateClass(chip.state)}`}>
                <div className="ops-health-chip-title">{chip.title}</div>
                <div className="ops-health-chip-state">{chip.state}</div>
                <div className="ops-health-chip-detail">{chip.detail}</div>
              </div>
            ))}
          </div>

          <div className="ops-health-actions">
            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onRetryWs}
              disabled={busyRetry}
              title="Force immediate reconnect"
            >
              {busyRetry ? 'Retrying...' : 'Retry WS'}
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onCancelRetry}
              disabled={busyCancel}
              title="Cancel pending reconnect attempts"
            >
              {busyCancel ? 'Canceling...' : 'Cancel Retry'}
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onRecoverUdp}
              disabled={busyRecover || canControl !== true}
              title={canControl === true ? 'Recover telemetry for all online vehicles' : 'Read-only: no control permission'}
            >
              {busyRecover ? 'Recovering...' : 'Recover UDP'}
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={() => fn_opsHealthClearHistory()}
              title="Clear panel history"
            >
              Clear History
            </button>

            <button
              type="button"
              className="btn btn-sm ops-health-btn"
              onClick={onExportDiagnostics}
              title="Export diagnostics bundle"
            >
              Export
            </button>
          </div>

          <div className="ops-health-filters">
            <label htmlFor="ops_history_party_filter" className="ops-health-filter-label">Timeline</label>
            <select
              id="ops_history_party_filter"
              className="form-select form-select-sm ops-health-filter-select"
              value={selectedPartyID}
              onChange={(event) => setSelectedPartyID(event.target.value)}
            >
              <option value="all">All Units</option>
              {unitRows.map((row) => (
                <option key={row.partyID} value={row.partyID}>
                  {row.unitName}
                </option>
              ))}
            </select>
          </div>

          {unitRows.length > 0 && (
            <div className="ops-health-retry-list">
              {unitRows.map((row) => (
                <div key={`retry_${row.partyID}`} className="ops-health-retry-row">
                  <span className="ops-health-retry-name">{row.unitName}</span>
                  <span className="ops-health-retry-count">
                    WS {row.wsRetryCount}/{row.wsRetryMax || '?'} | UDP {row.udpRetryCount}/{row.udpRetryMax || '?'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="ops-health-history">
            {filteredHistory.length === 0 && (
              <div className="ops-health-history-empty">No recent events</div>
            )}

            {filteredHistory.map((entry) => (
              <div key={entry.id} className={`ops-health-history-row ${fn_levelClass(entry.level)}`}>
                <span className="ops-health-time">{fn_formatTime(entry.ts)}</span>
                <span className="ops-health-source">{entry.source}</span>
                <span className="ops-health-message">
                  {entry.partyID ? `[${entry.partyID}] ` : ''}
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ClssOpsHealthPanel;

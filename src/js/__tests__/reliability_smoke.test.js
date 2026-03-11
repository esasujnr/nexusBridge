import { js_andruavAuth } from '../js_andruav_auth.js';
import * as js_andruavMessages from '../protocol/js_andruavMessages.js';
import * as js_andruavUnit from '../js_andruavUnit.js';
import { js_globals } from '../js_globals.js';
import {
  fn_opsHealthAddEvent,
  fn_opsHealthHandleProxyInfo,
  fn_opsHealthHandleSocketStatus,
  fn_opsHealthHandleTelemetryRecovery,
  fn_opsHealthReset,
  fn_opsHealthSnapshot,
} from '../js_ops_health.js';
import {
  fn_missionIntegrityMarkMapCleared,
  fn_missionIntegrityMarkReadRequested,
  fn_missionIntegrityReset,
  fn_missionIntegritySnapshot,
  fn_missionIntegrityUpdateFromDroneMission,
} from '../js_mission_integrity.js';

function fn_fakeOnlineUnit(partyID = 'droneA:1') {
  return {
    m_defined: true,
    m_IsGCS: false,
    m_IsDisconnectedFromGCS: false,
    m_IsShutdown: false,
    m_unitName: 'droneA',
    getPartyID: () => partyID,
    m_Telemetry: {
      m_udpProxy_recovery_state: 'idle',
      m_udpProxy_active: true,
      m_udpProxy_paused: false,
      m_udpProxy_ip: '10.0.0.12',
      m_udpProxy_port: 14550,
      m_telemetry_level: 2,
      m_udpProxy_status_note: '',
      m_udpProxy_retry_count: 0,
      m_udpProxy_retry_max: 0,
    },
    m_Video: {
      fn_getVideoStreaming: () => js_andruavUnit.CONST_VIDEOSTREAMING_OFF,
    },
  };
}

describe('Reliability Smoke', () => {
  beforeEach(() => {
    fn_opsHealthReset();
    fn_missionIntegrityReset();
    jest.restoreAllMocks();
    global.fetch = jest.fn();
    if (typeof global.AbortSignal === 'undefined') {
      global.AbortSignal = {};
    }
    if (typeof global.AbortSignal.timeout !== 'function') {
      global.AbortSignal.timeout = () => undefined;
    }
    js_globals.m_andruavUnitList = {
      fn_getUnitValues: () => [],
    };
  });

  afterEach(() => {
    delete global.fetch;
    js_andruavAuth._m_logined = false;
    js_andruavAuth._m_session_ID = null;
    js_andruavAuth.m_username = '';
    js_andruavAuth.m_accesscode = '';
  });

  test('login succeeds when probe fails but auth endpoint responds', async () => {
    jest.spyOn(js_andruavAuth, 'fn_probeServer').mockResolvedValue({
      success: false,
      isSslError: false,
    });

    global.fetch.mockResolvedValue({
      json: async () => ({
        e: js_andruavMessages.CONST_ERROR_NON,
        [js_andruavMessages.CONST_SESSION_ID]: 'session-123',
        [js_andruavMessages.CONST_COMM_SERVER]: {
          g: 'andruav.com',
          h: 9968,
          f: 'auth-key',
        },
        [js_andruavMessages.CONST_PERMISSION]: '0xffffffff',
        [js_andruavMessages.CONST_PERMISSION2]: 0xffffffff,
      }),
    });

    const ok = await js_andruavAuth.fn_do_loginAccount('pilot@example.com', 'secret');
    expect(ok).toBe(true);
    expect(js_andruavAuth.fn_logined()).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });

  test('network blip WS transitions end with deterministic failed state', () => {
    fn_opsHealthHandleSocketStatus({
      status: js_andruavMessages.CONST_SOCKET_STATUS_CONNECTING,
      retrying: false,
      attempt: 0,
      maxAttempts: 4,
      reason: 'Opening WebSocket',
      reasonCode: 'connecting',
    });

    fn_opsHealthHandleSocketStatus({
      status: js_andruavMessages.CONST_SOCKET_STATUS_DISCONNECTED,
      retrying: true,
      failed: false,
      attempt: 1,
      maxAttempts: 4,
      reason: 'WebSocket closed (1006)',
      reasonCode: 'closed_abnormal',
    });

    fn_opsHealthHandleSocketStatus({
      status: js_andruavMessages.CONST_SOCKET_STATUS_ERROR,
      retrying: false,
      failed: true,
      attempt: 4,
      maxAttempts: 4,
      reason: 'Reconnect attempts exhausted',
      reasonCode: 'retries_exhausted',
    });

    const snapshot = fn_opsHealthSnapshot();
    expect(snapshot.global.ws.state).toBe('failed');
    expect(snapshot.global.ws.detail).toContain('retries_exhausted');
    expect(snapshot.global.ws.attempt).toBe(4);
  });

  test('udp recovery state transitions and counters are tracked', () => {
    const unit = fn_fakeOnlineUnit();
    js_globals.m_andruavUnitList = {
      fn_getUnitValues: () => [unit],
    };
    fn_opsHealthHandleProxyInfo(unit);

    let snapshot = fn_opsHealthSnapshot();
    expect(snapshot.units['droneA:1'].udp.state).toBe('active');

    unit.m_Telemetry.m_udpProxy_recovery_state = 'recovering';
    unit.m_Telemetry.m_udpProxy_retry_count = 1;
    unit.m_Telemetry.m_udpProxy_retry_max = 2;
    fn_opsHealthHandleTelemetryRecovery('droneA:1', 'recovering', '', {
      unitName: 'droneA',
      attempt: 1,
      maxAttempts: 2,
    });

    snapshot = fn_opsHealthSnapshot();
    expect(snapshot.units['droneA:1'].udp.state).toBe('recovering');
    expect(snapshot.units['droneA:1'].udp.retryCount).toBe(1);
    expect(snapshot.units['droneA:1'].udp.retryMax).toBe(2);

    unit.m_Telemetry.m_udpProxy_recovery_state = 'inactive';
    unit.m_Telemetry.m_udpProxy_active = false;
    unit.m_Telemetry.m_udpProxy_status_note = 'drone-side-inactive';
    unit.m_Telemetry.m_udpProxy_retry_count = 2;
    unit.m_Telemetry.m_udpProxy_retry_max = 2;
    fn_opsHealthHandleTelemetryRecovery('droneA:1', 'inactive', 'drone-side-inactive', {
      unitName: 'droneA',
      attempt: 2,
      maxAttempts: 2,
    });

    snapshot = fn_opsHealthSnapshot();
    expect(snapshot.units['droneA:1'].udp.state).toBe('inactive');
    expect(snapshot.units['droneA:1'].udp.statusNote).toBe('drone-side-inactive');
  });

  test('mission integrity detects read/sync and stale map state', () => {
    const partyID = 'droneB:2';
    fn_missionIntegrityMarkReadRequested(partyID, 'droneB');

    let snapshot = fn_missionIntegritySnapshot();
    expect(snapshot.units[partyID].pendingRead).toBe(true);

    fn_missionIntegrityUpdateFromDroneMission(partyID, 'droneB', [
      {
        m_Sequence: 0,
        waypointType: js_andruavMessages.CONST_WayPoint_TYPE_TAKEOFF,
        Latitude: 7.947,
        Longitude: -1.026,
        Altitude: 40,
      },
      {
        m_Sequence: 1,
        waypointType: js_andruavMessages.CONST_WayPoint_TYPE_WAYPOINTSTEP,
        Latitude: 7.948,
        Longitude: -1.028,
        Altitude: 60,
      },
    ]);

    snapshot = fn_missionIntegritySnapshot();
    expect(snapshot.units[partyID].pendingRead).toBe(false);
    expect(snapshot.units[partyID].stale).toBe(false);
    expect(snapshot.units[partyID].droneChecksum).toBe(snapshot.units[partyID].mapChecksum);

    fn_missionIntegrityMarkMapCleared(partyID, 'droneB');
    snapshot = fn_missionIntegritySnapshot();
    expect(snapshot.units[partyID].stale).toBe(true);
    expect(snapshot.units[partyID].staleReason).toBe('map_cleared_local');
  });

  test('ops history remains capped at 20 items', () => {
    for (let i = 0; i < 25; i += 1) {
      fn_opsHealthAddEvent({
        source: 'ws',
        level: 'info',
        message: `event-${i}`,
      });
    }

    const snapshot = fn_opsHealthSnapshot();
    expect(snapshot.history.length).toBe(20);
    expect(snapshot.history[0].message).toBe('event-24');
    expect(snapshot.history[19].message).toBe('event-5');
  });
});

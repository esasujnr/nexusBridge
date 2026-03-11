import { js_eventEmitter } from '../js_eventEmitter.js';
import { EVENTS as js_event } from '../js_eventList.js';
import { fn_opsHealthReset, fn_opsHealthSnapshot } from '../js_ops_health.js';
import { fn_uiAlertsReset, fn_uiAlertsSnapshot } from '../js_ui_alerts.js';
import {
  fn_commandFeedbackInit,
  fn_commandFeedbackReset,
  fn_commandFeedbackSnapshot,
  fn_commandFeedbackTrackArm,
  fn_commandFeedbackTrackFlightMode,
} from '../js_command_feedback.js';

function fn_fakeUnit(partyID = 'droneA:1') {
  return {
    getPartyID: () => partyID,
    m_unitName: 'droneA',
    m_isArmed: false,
    m_flightMode: 0,
    m_Geo_Tags: {
      p_HomePoint: {
        m_isValid: false,
        lat: 0,
        lng: 0,
      },
    },
  };
}

describe('Command Feedback', () => {
  beforeAll(() => {
    fn_commandFeedbackInit();
  });

  beforeEach(() => {
    fn_commandFeedbackReset();
    fn_opsHealthReset();
    fn_uiAlertsReset();
  });

  test('arm command is confirmed after armed telemetry update', () => {
    const unit = fn_fakeUnit('droneA:1');
    const tracked = fn_commandFeedbackTrackArm(unit, true, true, { label: 'ARM', timeoutMs: 3000 });
    expect(tracked).toBe(true);

    unit.m_isArmed = true;
    js_eventEmitter.fn_dispatch(js_event.EE_andruavUnitArmedUpdated, unit);

    const pending = fn_commandFeedbackSnapshot().pending;
    expect(pending.length).toBe(0);

    const history = fn_opsHealthSnapshot().history;
    expect(history[0].message).toContain('ARM confirmed');
  });

  test('flight mode send failure raises warning alert immediately', () => {
    const unit = fn_fakeUnit('droneA:1');
    fn_commandFeedbackTrackFlightMode(unit, 6, false, { label: 'RTL', timeoutMs: 3000 });

    const alerts = fn_uiAlertsSnapshot().events;
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].message).toContain('send failed');
  });

  test('pending command times out if telemetry confirmation does not arrive', async () => {
    const unit = fn_fakeUnit('droneA:1');
    fn_commandFeedbackTrackFlightMode(unit, 6, true, { label: 'RTL', timeoutMs: 200 });

    await new Promise((resolve) => setTimeout(resolve, 800));

    const pending = fn_commandFeedbackSnapshot().pending;
    expect(pending.length).toBe(0);

    const history = fn_opsHealthSnapshot().history;
    expect(history[0].message).toContain('not confirmed');
    expect(history[0].message).toContain('timeout');
  });
});

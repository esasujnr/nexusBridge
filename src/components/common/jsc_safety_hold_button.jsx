import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_HOLD_MS = 900;

function ClssSafetyHoldButton(props) {
  const holdMs = Number.isFinite(props.holdMs) ? props.holdMs : DEFAULT_HOLD_MS;
  const disabled = props.disabled === true;
  const showProgressText = props.showProgressText === true;
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const ref = useRef({
    completeTimer: null,
    progressTimer: null,
    startedAt: 0,
  });

  const fn_stop = () => {
    if (ref.current.completeTimer) {
      clearTimeout(ref.current.completeTimer);
      ref.current.completeTimer = null;
    }
    if (ref.current.progressTimer) {
      clearInterval(ref.current.progressTimer);
      ref.current.progressTimer = null;
    }
    ref.current.startedAt = 0;
    setIsHolding(false);
    setProgress(0);
  };

  const fn_start = () => {
    if (disabled) return;
    fn_stop();
    ref.current.startedAt = Date.now();
    setIsHolding(true);
    setProgress(0);

    ref.current.progressTimer = setInterval(() => {
      const elapsed = Date.now() - ref.current.startedAt;
      const p = Math.min(100, Math.round((elapsed / holdMs) * 100));
      setProgress(p);
    }, 40);

    ref.current.completeTimer = setTimeout(() => {
      fn_stop();
      if (typeof props.onConfirm === 'function') {
        props.onConfirm();
      }
    }, holdMs);
  };

  useEffect(() => () => {
    if (ref.current.completeTimer) {
      clearTimeout(ref.current.completeTimer);
      ref.current.completeTimer = null;
    }
    if (ref.current.progressTimer) {
      clearInterval(ref.current.progressTimer);
      ref.current.progressTimer = null;
    }
  }, []);

  const fn_handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    fn_start();
  };

  const fn_handlePointerStop = (event) => {
    event.stopPropagation();
    fn_stop();
  };

  return (
    <button
      type="button"
      id={props.id}
      className={`${props.className || ''} ${isHolding ? 'nb-safety-hold-btn is-holding' : 'nb-safety-hold-btn'}`}
      title={props.title || 'Press and hold to confirm'}
      onPointerDown={fn_handlePointerDown}
      onPointerUp={fn_handlePointerStop}
      onPointerLeave={fn_handlePointerStop}
      onPointerCancel={fn_handlePointerStop}
      onContextMenu={(event) => event.preventDefault()}
      disabled={disabled}
    >
      <span className="nb-safety-hold-btn__label">{props.children}</span>
      {isHolding && (
        <span className="nb-safety-hold-btn__progress" style={{ width: `${progress}%` }}></span>
      )}
      {isHolding && showProgressText && (
        <span className="nb-safety-hold-btn__pct">{progress}%</span>
      )}
    </button>
  );
}

export default ClssSafetyHoldButton;

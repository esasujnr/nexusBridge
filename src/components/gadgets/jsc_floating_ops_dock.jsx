import React, { useEffect, useRef, useState } from 'react';
import ClssOpsHealthPanel from './jsc_ops_health_panel.jsx';
import ClssOpsUIToolsPanel from './jsc_ops_ui_tools_panel.jsx';

const STORAGE_KEY = 'nb-floating-ops-dock-v1';

const fn_readSavedState = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { collapsed: true, x: null, y: 112 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { collapsed: true, x: null, y: 112 };
    const parsed = JSON.parse(raw);
    return {
      collapsed: parsed?.collapsed === true,
      x: Number.isFinite(parsed?.x) ? parsed.x : null,
      y: Number.isFinite(parsed?.y) ? parsed.y : 112
    };
  } catch {
    return { collapsed: true, x: null, y: 112 };
  }
};

const fn_saveState = (state) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
};

const fn_clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const ClssFloatingOpsDock = () => {
  const [dockState, setDockState] = useState(fn_readSavedState);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const getPanelWidth = () => {
    if (panelRef.current) return panelRef.current.getBoundingClientRect().width;
    return 380;
  };

  const getPanelHeight = () => {
    if (panelRef.current) return panelRef.current.getBoundingClientRect().height;
    return 560;
  };

  const getResolvedPosition = () => {
    const width = getPanelWidth();
    const height = getPanelHeight();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
    const minX = 8;
    const minY = 68;
    const maxX = Math.max(minX, viewportWidth - width - 8);
    const maxY = Math.max(minY, viewportHeight - height - 8);

    const fallbackX = Math.max(minX, viewportWidth - width - 18);
    const baseX = Number.isFinite(dockState.x) ? dockState.x : fallbackX;
    const baseY = Number.isFinite(dockState.y) ? dockState.y : 112;
    return {
      x: fn_clamp(baseX, minX, maxX),
      y: fn_clamp(baseY, minY, maxY)
    };
  };

  const resolvedPosition = getResolvedPosition();

  useEffect(() => {
    fn_saveState(dockState);
  }, [dockState]);

  useEffect(() => {
    if (isDragging !== true) return undefined;

    const onMouseMove = (event) => {
      const width = getPanelWidth();
      const height = getPanelHeight();
      const minX = 8;
      const minY = 68;
      const maxX = Math.max(minX, window.innerWidth - width - 8);
      const maxY = Math.max(minY, window.innerHeight - height - 8);
      const nextX = fn_clamp(event.clientX - dragOffsetRef.current.x, minX, maxX);
      const nextY = fn_clamp(event.clientY - dragOffsetRef.current.y, minY, maxY);
      setDockState((prev) => ({ ...prev, x: nextX, y: nextY }));
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const onResize = () => {
      if (dockState.collapsed === true) return;
      const next = getResolvedPosition();
      if (next.x === resolvedPosition.x && next.y === resolvedPosition.y) return;
      setDockState((prev) => ({ ...prev, x: next.x, y: next.y }));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [dockState.collapsed, resolvedPosition.x, resolvedPosition.y]);

  const onDragStart = (event) => {
    if (event.button !== 0) return;
    const rect = panelRef.current?.getBoundingClientRect?.();
    if (!rect) return;
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    setIsDragging(true);
    event.preventDefault();
  };

  const onCollapse = () => {
    setDockState((prev) => ({ ...prev, collapsed: true }));
  };

  const onExpand = () => {
    setDockState((prev) => ({ ...prev, collapsed: false }));
  };

  if (dockState.collapsed === true) {
    return (
      <button
        type="button"
        className="nb-floating-ops-pin"
        onClick={onExpand}
        aria-label="Open ops dock"
        title="Open ops dock"
      >
        <span className="bi bi-layout-sidebar-inset" aria-hidden="true"></span>
        <span className="nb-floating-ops-pin__label">Ops</span>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`nb-floating-ops-dock ${isDragging ? 'is-dragging' : ''}`}
      style={{ left: `${resolvedPosition.x}px`, top: `${resolvedPosition.y}px` }}
    >
      <div className="nb-floating-ops-dock__header" onMouseDown={onDragStart}>
        <span className="nb-floating-ops-dock__title">
          <span className="bi bi-grip-horizontal" aria-hidden="true"></span>
          <span>Ops Dock</span>
        </span>
        <button
          type="button"
          className="nb-floating-ops-dock__collapse"
          onClick={onCollapse}
          aria-label="Collapse ops dock"
          title="Collapse to side pin"
        >
          <span className="bi bi-chevron-right" aria-hidden="true"></span>
        </button>
      </div>
      <div className="nb-floating-ops-dock__content">
        <ClssOpsHealthPanel />
        <ClssOpsUIToolsPanel />
      </div>
    </div>
  );
};

export default ClssFloatingOpsDock;

import React from 'react';

type Row = {
  stage: 'TECH'|'CREATIVE'|'INSTR';
  fileId: string;
  name: string;
  status: 'queued'|'running'|'done'|'error';
  ms?: number;
  error?: string;
};

export default function QueuePanel() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const upsert = React.useCallback((next: Row) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.stage === next.stage && r.fileId === next.fileId);
      if (idx === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...next };
      return copy;
    });
  }, []);

  React.useEffect(() => {
    // wire creative lifecycle
    const offEvent = window.rnaQueue?.onEvent?.((evt) => {
      if (evt.stage !== 'CREATIVE') return;
      if (evt.type === 'start') {
        upsert({
          stage: 'CREATIVE',
          fileId: evt.fileId,
          name: evt.name,
          status: 'running'
        });
      } else if (evt.type === 'done') {
        upsert({
          stage: 'CREATIVE',
          fileId: evt.fileId,
          name: evt.name,
          status: evt.ok ? 'done' : 'error',
          ms: evt.ms,
          error: evt.ok ? undefined : evt.error
        });
      }
    });
    return () => { try { offEvent?.(); } catch {} };
  }, [upsert]);

  // (optional) show queue pressure somewhere in the panel header
  const [pressure, setPressure] = React.useState<{pending:number,size:number}>({pending:0,size:0});
  React.useEffect(() => {
    const offP = window.rnaQueue?.onPressure?.((p) => {
      if (p.stage === 'CREATIVE') setPressure({ pending: p.pending, size: p.size });
    });
    return () => { try { offP?.(); } catch {} };
  }, []);

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <strong>Creative</strong>
        <span style={{ marginLeft: 8, opacity: 0.7 }}>
          {pressure.pending} running · {pressure.size} queued
        </span>
      </div>
      <div className="queue-list">
        {rows
          .filter(r => r.stage === 'CREATIVE')
          .map(r => (
            <div key={`cre-${r.fileId}`} className={`queue-row ${r.status}`}>
              <span className="name">{r.name}</span>
              <span className="status">{r.status}</span>
              {typeof r.ms === 'number' && <span className="ms">{r.ms} ms</span>}
              {r.error && <span className="err" title={r.error}>!</span>}
            </div>
        ))}
      </div>
    </div>
  );
}


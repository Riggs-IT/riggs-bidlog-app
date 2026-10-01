import { useEffect } from 'react';
import './CsvExportDialog.css';

export default function CsvExportDialog({ open, onClose, onMonthly, onBreakdown, projectCount = 0 }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="csv-export-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="csv-export-dialog" role="dialog" aria-modal="true" aria-labelledby="csv-export-title">
        <div className="csv-export-heading">
          <div>
            <span>EXPORT CSV</span>
            <h2 id="csv-export-title">Choose export</h2>
          </div>
          <button type="button" className="csv-export-close" onClick={onClose} aria-label="Close export dialog">×</button>
        </div>

        <div className="csv-export-options">
          <button type="button" className="csv-export-option" onClick={() => { onMonthly(); onClose(); }}>
            <strong>Monthly</strong>
            <span>One row per project or bid month using the current filters and date range.</span>
          </button>

          <button type="button" className="csv-export-option" onClick={() => { onBreakdown(); onClose(); }}>
            <strong>Billing Breakdown</strong>
            <span>Project-level billing, staffing, forecast, actual, and variance details for the filtered view.</span>
          </button>
        </div>

        <div className="csv-export-footer">
          <span>{projectCount} filtered {projectCount === 1 ? 'row' : 'rows'}</span>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

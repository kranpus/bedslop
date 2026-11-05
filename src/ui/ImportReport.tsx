import { create } from "zustand";
import type { ImportReport } from "../import/addon";
import { kindInfo } from "../model/registry";
import type { ElementKind } from "../model/types";
import { Modal } from "./Modal";

/** The last add-on import's report, shown once the new project opens. */
export const useImportReport = create<{ report: ImportReport | null; show(r: ImportReport | null): void }>((set) => ({
  report: null,
  show: (report) => set({ report }),
}));

export function ImportReportModal() {
  const { report, show } = useImportReport();
  if (!report) return null;
  const counts = Object.entries(report.counts);
  const close = () => show(null);
  return (
    <Modal title="Add-on imported" onClose={close} wide footer={<button className="btn primary" onClick={close}>Start editing</button>}>
      <p className="muted">From {report.packs.join(" and ")}.</p>
      {counts.length ? (
        <ul className="import-counts">
          {counts.map(([k, n]) => <li key={k}><strong>{n}</strong> {kindInfo(k as ElementKind).label.toLowerCase()}{n > 1 ? "s" : ""}</li>)}
        </ul>
      ) : <p className="warn-text">Nothing the editor understands was found.</p>}
      {report.notes.length > 0 && (
        <section>
          <h3>Imported partly</h3>
          <ul className="hint-list">{report.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}
      {report.skipped.length > 0 && (
        <section>
          <h3>Not imported</h3>
          <ul className="hint-list">{report.skipped.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}
      <p className="field-help">Your original files aren't changed. Exporting this project makes a new add-on with new pack IDs, so remove the old one from your world first.</p>
    </Modal>
  );
}

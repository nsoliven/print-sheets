import { Check, Download, Ruler, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Format } from "../lib/formats";
import { findIssues } from "../lib/issues";
import { PAPERS, PRINTER_NAME, type PaperId } from "../lib/paper";
import { buildPdf, pdfName, sheetsOf } from "../lib/pdf";
import { prefs } from "../lib/persist";
import { photoStore } from "../lib/photos";
import type { Doc } from "../lib/store";
import { inches, mmLabel } from "../lib/units";
import { Sheet } from "./Sheet";

interface Props {
  doc: Doc;
  format: Format;
  onClose: () => void;
  onShow: (id: string) => void;
}

type Status = { kind: "idle" } | { kind: "working"; done: number; total: number } | { kind: "saved"; name: string } | { kind: "error" };

export function PrintPanel({ doc, format: f, onClose, onShow }: Props) {
  const count = sheetsOf(doc);
  const [paper, setPaper] = useState<PaperId>(() => prefs.get("paper", "glossy"));
  const [pick, setPick] = useState<"all" | number>("all");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const p = PAPERS[paper];
  const sheets = pick === "all" ? Array.from({ length: count }, (_, i) => i) : [pick];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Anything that would look bad on paper, found before spending a sheet of photo paper.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const issues = useMemo(() => findIssues(doc, sheets), [doc, pick, count]);
  // Until a plain-paper test has been saved once, suggest one before using photo paper.
  const [tested, setTested] = useState<boolean>(() => prefs.get("tested", false));

  const save = async () => {
    setStatus({ kind: "working", done: 0, total: 1 });
    try {
      const bytes = await buildPdf({
        doc,
        sheets,
        photo: photoStore.get,
        onProgress: (done, total) => setStatus({ kind: "working", done, total }),
      });
      const name = pdfName(doc, sheets, count);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus({ kind: "saved", name });
      if (paper === "plain" && !tested) {
        setTested(true);
        prefs.set("tested", true);
      }
      // Printing one sheet at a time is common with photo paper, so get the next one ready.
      if (pick !== "all" && pick + 1 < count) setPick(pick + 1);
    } catch (e) {
      console.error(e);
      setStatus({ kind: "error" });
    }
  };

  const choosePaper = (id: PaperId) => {
    setPaper(id);
    prefs.set("paper", id);
  };

  const warn = (ids: string[], one: string, many: string) =>
    ids.length > 0 && (
      <button className="issue" onClick={() => onShow(ids[0])}>
        <TriangleAlert size={15} />
        <span>{ids.length === 1 ? one : many.replace("#", String(ids.length))}</span>
        <span className="issue-link">Show</span>
      </button>
    );

  const thumbW = count > 3 ? 64 : 84;

  // The print dialog as a checklist to tick off while it's open. Ticks reset when the paper changes.
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => setDone(new Set()), [paper]);
  const steps: { id: string; label: string; key?: boolean; body: React.ReactNode }[] = [
    { id: "load", label: "Load", body: p.load },
    {
      id: "printer",
      label: "Printer",
      body: (
        <>
          <b>{PRINTER_NAME}</b>, not the one without “Epson driver”
        </>
      ),
    },
    { id: "size", label: "Paper Size", body: <b>US Letter</b> },
    {
      id: "scale",
      label: "Scale · most important",
      key: true,
      body: (
        <>
          <b>100%</b>. Never “Scale to Fit”, or every print comes out smaller.
        </>
      ),
    },
    {
      id: "media",
      label: "Print Settings",
      body: (
        <>
          Media Type <b>{p.mediaType}</b>, Print Quality <b>{p.quality}</b>
        </>
      ),
    },
    {
      id: "color",
      label: "Color",
      body: (
        <>
          Color Matching <b>EPSON Color Controls</b>, then Color Options Mode <b>EPSON Standard (sRGB)</b>
        </>
      ),
    },
    { id: "after", label: "After", body: p.after },
  ];
  const toggle = (id: string) =>
    setDone((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="panel-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel" role="dialog" aria-modal="true" aria-label="Print">
        <header className="panel-head">
          <div>
            <h2>Print</h2>
            <p>
              {doc.prints.length} {f.name} {doc.prints.length === 1 ? "print" : "prints"} on {count} {count === 1 ? "sheet" : "sheets"}
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="panel-body">
          {count > 1 && (
            <section>
              <h3>Which sheet</h3>
              <div className="sheet-picks">
                <button className={`sheet-pick sheet-pick-all${pick === "all" ? " is-on" : ""}`} onClick={() => setPick("all")}>
                  <span className="pick-stack">
                    <Sheet doc={doc} format={f} index={0} width={thumbW} />
                  </span>
                  <span>All {count}</span>
                </button>
                {Array.from({ length: count }, (_, i) => (
                  <button key={i} className={`sheet-pick${pick === i ? " is-on" : ""}`} onClick={() => setPick(i)}>
                    <Sheet doc={doc} format={f} index={i} width={thumbW} />
                    <span>Sheet {i + 1}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3>Paper</h3>
            <div className="segmented" role="radiogroup" aria-label="Paper">
              {(Object.keys(PAPERS) as PaperId[]).map((id) => (
                <button key={id} role="radio" aria-checked={paper === id} className={paper === id ? "is-on" : ""} onClick={() => choosePaper(id)}>
                  <span className={`paper-swatch paper-${id}`} aria-hidden />
                  <span>{PAPERS[id].name}</span>
                  <span className="muted small">{PAPERS[id].detail}</span>
                </button>
              ))}
            </div>
            {!tested && paper === "glossy" && (
              <p className="tip">
                <Ruler size={15} />
                <span>
                  First time? Print once on plain paper and measure a card before using photo paper.{" "}
                  <button className="link" onClick={() => choosePaper("plain")}>
                    Use plain paper
                  </button>
                </span>
              </p>
            )}
          </section>

          {(issues.blurry.length > 0 || issues.soft.length > 0 || issues.long.length > 0) && (
            <section className="issues">
              {warn(issues.blurry, "1 photo will look blurry", "# photos will look blurry")}
              {warn(issues.soft, "1 photo may look a little soft", "# photos may look a little soft")}
              {warn(issues.long, "1 caption is too long to fit", "# captions are too long to fit")}
            </section>
          )}

          <button className="btn btn-primary btn-wide save" onClick={save} disabled={status.kind === "working"}>
            {status.kind === "working" && (
              <span className="save-progress" style={{ transform: `scaleX(${status.total ? status.done / status.total : 0})` }} />
            )}
            {status.kind === "working" ? (
              <span className="save-label">Preparing {status.total > 1 ? `print ${status.done} of ${status.total}` : "…"}</span>
            ) : (
              <>
                <Download size={17} /> Save PDF{sheets.length > 1 ? ` (${sheets.length} sheets)` : count > 1 ? ` (sheet ${sheets[0] + 1})` : ""}
              </>
            )}
          </button>
          {status.kind === "saved" && (
            <p className="saved" aria-live="polite">
              <Check size={16} /> Saved “{status.name}” to Downloads. Open it in Preview and press ⌘P.
            </p>
          )}
          {status.kind === "error" && (
            <p className="saved is-error" aria-live="polite">
              Something went wrong making the PDF. Try again, or try fewer sheets at once.
            </p>
          )}

          <section className={`settings${status.kind === "saved" ? " is-next" : ""}`}>
            <div className="settings-head">
              <h3>In the print dialog</h3>
              <span>{done.size ? `${done.size} of ${steps.length} done` : "Tick them off as you go"}</span>
            </div>
            <ol className="checklist">
              {steps.map((st) => (
                <li key={st.id}>
                  <button
                    className={`check-row${done.has(st.id) ? " is-done" : ""}${st.key ? " is-key" : ""}`}
                    aria-pressed={done.has(st.id)}
                    onClick={() => toggle(st.id)}
                  >
                    <span className="tick">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="check-text">
                      <span className="check-label">{st.label}</span>
                      {st.body}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="check-size">
              <Ruler size={18} />
              <span>
                Each print should measure{" "}
                <b>
                  {mmLabel(f.w)} × {mmLabel(f.h)} mm
                </b>{" "}
                ({inches(f.w)} × {inches(f.h)} in).
              </span>
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

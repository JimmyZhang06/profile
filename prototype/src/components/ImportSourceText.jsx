import "./resume-import.css";

export function ImportSourceText({ source, ids, label = "对应原文" }) {
  if (!source) return null;
  const blocks = ids
    ? source.blocks.filter((b) => ids.includes(b.id))
    : source.blocks;
  return (
    <div className="import-source-text" aria-label={label}>
      {blocks.length ? (
        blocks.map((b) => (
          <div key={b.id}>
            <small>
              {b.location}
              {b.ocr ? " · 文字识别" : ""}
            </small>
            <blockquote>{b.text}</blockquote>
          </div>
        ))
      ) : (
        <p className="quiet-note">这段内容由你手动补充。</p>
      )}
    </div>
  );
}

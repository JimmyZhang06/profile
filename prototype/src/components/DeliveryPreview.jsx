import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ResumeDocument } from "./ResumeDocument.jsx";
import { getResumeDesign } from "../lib/resumeDesign.js";

const MM = 96 / 25.4;
export function DeliveryPreview({ resume, onMeasure, hidden = false }) {
  const paper = useRef(null),
    viewport = useRef(null),
    callback = useRef(onMeasure);
  const [size, setSize] = useState({ scale: 0.7, height: 297 * MM });
  callback.current = onMeasure;
  useLayoutEffect(() => {
    let cancelled = false,
      frame;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(async () => {
        await document.fonts.ready;
        if (cancelled || !paper.current) return;
        const height = paper.current.offsetHeight,
          width = paper.current.offsetWidth;
        const scale = hidden
          ? 1
          : Math.min(1, (viewport.current?.clientWidth || width) / width);
        setSize((old) =>
          old.scale === scale && old.height === height
            ? old
            : { scale, height },
        );
        callback.current?.({
          resume,
          heightMm: height / MM,
          overflowMm: Math.max(0, (height - 297 * MM) / MM),
          overflow: height > 297 * MM - 4,
          horizontal: paper.current.scrollWidth > width + 1,
        });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(paper.current);
    if (viewport.current) observer.observe(viewport.current);
    document.fonts.addEventListener("loadingdone", measure);
    measure();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [resume, hidden]);
  return (
    <div
      className={hidden ? "delivery-measure" : "delivery-preview"}
      ref={viewport}
      aria-hidden={hidden || undefined}
    >
      <div
        className="delivery-paper-frame"
        style={{ height: Math.max(size.height, 297 * MM) * size.scale }}
      >
        <div
          className="delivery-paper-sheet"
          style={{ transform: `scale(${size.scale})`, minHeight: "297mm" }}
        >
          <ResumeDocument
            ref={paper}
            resume={resume}
            readOnly
            className="delivery-paper"
          />
          {size.height > 297 * MM ? (
            <div className="delivery-page-boundary" style={{ top: "297mm" }}>
              <span>超出一页</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DeliveryPrint({ resume }) {
  const margin = getResumeDesign(resume).margin;
  return createPortal(
    <div className="delivery-print-host">
      <style media="print">{`@page { size: A4; margin: ${margin}mm; }`}</style>
      <ResumeDocument resume={resume} readOnly className="delivery-paper" />
    </div>,
    document.body,
  );
}

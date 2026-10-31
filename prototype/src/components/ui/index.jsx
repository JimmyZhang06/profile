import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconLoader2,
} from "@tabler/icons-react";
import { PageNavigationContext } from "../../hooks/usePageNavigation.js";
import "./menu.css";

export function IconButton({ label, children, className = "", ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tooltip={label}
      className={"icon-button " + className}
      {...props}
    >
      {children}
    </button>
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  busy,
  ...props
}) {
  return (
    <button
      type="button"
      className={"button button-" + variant + " " + className}
      {...props}
    >
      {busy ? <IconLoader2 size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Page({
  title,
  description,
  children,
  onBack,
  backLabel = "返回简历",
  className = "",
  footer,
  actions,
  navigation: pageNavigation,
  dirty = false,
}) {
  const id = useId(),
    heading = useRef(null);
  const navigation = useContext(PageNavigationContext);
  const registerDirty = navigation?.registerDirty;
  useLayoutEffect(() => {
    registerDirty?.(dirty);
    return () => registerDirty?.(false);
  }, [dirty, registerDirty]);
  useEffect(() => {
    if (
      !heading.current
        ?.closest(".workspace-page")
        ?.contains(document.activeElement)
    )
      heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className={"workspace-page " + className} aria-labelledby={id}>
      <header className="page-topbar">
        <button type="button" className="page-back" onClick={onBack}>
          <IconArrowLeft size={17} />
          {backLabel}
        </button>
        <div className="page-location">
          <span>{title}</span>
        </div>
        <span className="page-document-title" title={navigation?.documentTitle}>
          {navigation?.documentTitle}
        </span>
      </header>
      <div className="page-scroll">
        <div className="page-content">
          <header className="page-heading">
            <div>
              <h1 ref={heading} id={id} tabIndex={-1}>
                {title}
              </h1>
              {description ? <p>{description}</p> : null}
            </div>
            {actions ? (
              <div className="page-heading-actions">{actions}</div>
            ) : null}
          </header>
          {pageNavigation}
          {children}
        </div>
      </div>
      {footer ? (
        <footer className="page-footer">
          <div className="page-footer-content">{footer}</div>
        </footer>
      ) : null}
    </section>
  );
}
export function Menu({ label, icon, value, items, className = "", children }) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState(null);
  const ref = useRef(null),
    trigger = useRef(null),
    popover = useRef(null),
    initialFocus = useRef("first");
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(),
        menu = popover.current;
      if (!anchor || !menu) return;
      const viewport = window.visualViewport;
      const edge = 8,
        gap = 6,
        leftEdge = (viewport?.offsetLeft || 0) + edge,
        topEdge = (viewport?.offsetTop || 0) + edge;
      const rightEdge =
        leftEdge + (viewport?.width || window.innerWidth) - edge * 2;
      const bottomEdge =
        topEdge + (viewport?.height || window.innerHeight) - edge * 2;
      if (!anchor.width || anchor.bottom < topEdge || anchor.top > bottomEdge) {
        setOpen(false);
        return;
      }
      const width = Math.min(menu.offsetWidth, rightEdge - leftEdge);
      const above = Math.max(0, anchor.top - gap - topEdge),
        below = Math.max(0, bottomEdge - anchor.bottom - gap);
      const desired = Math.min(menu.scrollHeight + 2, bottomEdge - topEdge);
      const up = className.includes("opens-up")
        ? above >= desired || above > below
        : below < desired && above > below;
      const maxHeight = Math.min(desired, up ? above : below);
      const next = {
        left: Math.max(leftEdge, Math.min(anchor.left, rightEdge - width)),
        top: up ? anchor.top - gap - maxHeight : anchor.bottom + gap,
        width,
        maxHeight,
      };
      setPosition((old) =>
        old && Object.keys(next).every((key) => old[key] === next[key])
          ? old
          : next,
      );
    };
    place();
    const close = (e) => {
      if (
        !ref.current?.contains(e.target) &&
        !popover.current?.contains(e.target)
      )
        setOpen(false);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    const reposition = (e) => {
      if (!popover.current?.contains(e.target)) place();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, className]);
  useLayoutEffect(() => {
    if (!open || !position || !initialFocus.current) return;
    const buttons = popover.current?.querySelectorAll(
      '[role="menuitem"]:not(:disabled)',
    );
    (initialFocus.current === "last"
      ? buttons?.[buttons.length - 1]
      : buttons?.[0]
    )?.focus({ preventScroll: true });
    initialFocus.current = null;
  }, [open, position]);
  function show(focus = "first") {
    initialFocus.current = focus;
    setPosition(null);
    setOpen(true);
  }
  function navigate(e) {
    const buttons = Array.from(
      popover.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ||
        [],
    );
    const index = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[
        (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length
      ]?.focus({ preventScroll: true });
    }
    if (e.key === "Home") {
      e.preventDefault();
      buttons[0]?.focus({ preventScroll: true });
    }
    if (e.key === "End") {
      e.preventDefault();
      buttons.at(-1)?.focus({ preventScroll: true });
    }
    if (e.key === "Tab") {
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
      document.activeElement?.scrollIntoView({ block: "nearest" });
  }
  return (
    <div className={"menu " + className} ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show(e.key === "ArrowUp" ? "last" : "first");
          }
        }}
      >
        {icon}
        {children || value}
        <IconChevronDown size={14} />
      </button>
      {open
        ? createPortal(
            <div className={"menu-layer " + className}>
              <div
                ref={popover}
                className="menu-popover"
                id={id}
                role="menu"
                aria-label={label}
                onKeyDown={navigate}
                style={{
                  ...position,
                  position: "fixed",
                  right: "auto",
                  bottom: "auto",
                  visibility: position ? "visible" : "hidden",
                }}
              >
                {items.map((item, i) =>
                  item.separator ? (
                    <hr key={i} />
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      key={item.value || item.label}
                      disabled={item.disabled}
                      className={item.danger ? "danger-text" : ""}
                      onClick={() => {
                        setOpen(false);
                        trigger.current?.focus({ preventScroll: true });
                        item.onClick?.();
                      }}
                    >
                      {item.icon}
                      <span>
                        {item.label}
                        {item.description ? (
                          <small>{item.description}</small>
                        ) : null}
                      </span>
                      {item.selected ? <IconCheck size={16} /> : null}
                      {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                    </button>
                  ),
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      className={"toggle " + (checked ? "on" : "")}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={"field " + className}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

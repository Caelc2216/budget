"use client";

import { useEffect, useState } from "react";

const STORAGE_PREFIX = "budget:collapsible:";

export default function Collapsible({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  // Start open on both server and first client render so markup matches
  // (avoids a hydration mismatch); the stored preference is applied right
  // after mount.
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + id);
    setOpen(stored === null ? defaultOpen : stored === "1");
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem(STORAGE_PREFIX + id, next ? "1" : "0");
  }

  return (
    <div className="card" style={ready ? undefined : { visibility: "hidden" }}>
      <h3
        className="collapsible-header"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {title}
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </h3>
      {open && children}
    </div>
  );
}

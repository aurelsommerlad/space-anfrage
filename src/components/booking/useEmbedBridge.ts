"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Kommunikation zwischen /embed (iframe) und der einbindenden Seite.
 *
 * Nachrichten an die Elternseite (nur an eine ausdrücklich erlaubte Origin):
 *   { type: "space-anfrage:height", height: number }   – benötigte Höhe in px
 *   { type: "space-anfrage:scroll-top" }               – Schrittwechsel, Anfang zeigen
 * Nachricht von der Elternseite:
 *   { type: "space-anfrage:hello" }                     – meldet die Origin der Elternseite
 *
 * Die Origin der Elternseite wird aus window.location.ancestorOrigins bzw.
 * document.referrer ermittelt oder über "hello" bestätigt – in jedem Fall nur,
 * wenn sie in der Liste der erlaubten Origins steht. Ohne erlaubte Origin wird
 * nichts gesendet.
 */
export const MSG_HEIGHT = "space-anfrage:height";
export const MSG_SCROLL_TOP = "space-anfrage:scroll-top";
export const MSG_HELLO = "space-anfrage:hello";

function detectParentOrigin(allowed: readonly string[]): string | null {
  const candidates: string[] = [];
  try {
    const ao = window.location.ancestorOrigins;
    if (ao && ao.length > 0) candidates.push(ao[0]!);
  } catch {
    /* nicht unterstützt (z. B. Firefox) */
  }
  try {
    if (document.referrer) candidates.push(new URL(document.referrer).origin);
  } catch {
    /* ungültiger Referrer */
  }
  return candidates.find((c) => allowed.includes(c)) ?? null;
}

export function useEmbedBridge(enabled: boolean, allowedOrigins: readonly string[], rootRef: RefObject<HTMLElement | null>) {
  const parentOrigin = useRef<string | null>(null);
  const lastHeight = useRef(0);
  const allowedKey = allowedOrigins.join(" ");

  const send = useCallback((message: Record<string, unknown>) => {
    const origin = parentOrigin.current;
    if (!origin || window.parent === window) return;
    window.parent.postMessage(message, origin);
  }, []);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return 0;
    // Höhe des Inhalts, nicht des Viewports – so kann das iframe auch schrumpfen.
    return Math.ceil(root.offsetTop + root.getBoundingClientRect().height);
  }, [rootRef]);

  /** Meldet die aktuelle Höhe (force = auch ohne Änderung). */
  const reportHeight = useCallback(
    (force = false) => {
      const h = measure();
      if (!h || (!force && h === lastHeight.current)) return;
      lastHeight.current = h;
      send({ type: MSG_HEIGHT, height: h });
    },
    [measure, send],
  );

  const requestScrollTop = useCallback(() => send({ type: MSG_SCROLL_TOP }), [send]);

  useEffect(() => {
    if (!enabled || window.parent === window) return;
    const allowed = allowedKey ? allowedKey.split(" ") : [];
    if (allowed.length === 0) return;

    parentOrigin.current = detectParentOrigin(allowed);

    function onMessage(e: MessageEvent) {
      if (e.source !== window.parent || !allowed.includes(e.origin)) return;
      const data = e.data as { type?: unknown } | null;
      if (!data || data.type !== MSG_HELLO) return;
      parentOrigin.current = e.origin;
      reportHeight(true);
    }
    window.addEventListener("message", onMessage);

    // Größenänderungen (Schritte, Fehlermeldungen, Auf-/Zuklappen, Breite).
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => reportHeight());
    };
    const ro = new ResizeObserver(schedule);
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener("resize", schedule);
    reportHeight(true);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, allowedKey, reportHeight, rootRef]);

  return { reportHeight, requestScrollTop };
}

"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_DATA_LAYER,
  ANALYTICS_PREFERENCES_EVENT,
  type AnalyticsConsent,
  getAnalyticsPage,
  isAnalyticsHost,
  markAnalyticsReady,
  parseAnalyticsConsent,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  stopAnalytics,
  updateAnalyticsPage,
  validMeasurementId,
} from "@/lib/analytics";
import styles from "./analytics.module.css";

/** Mount once in the root layout. No Google request is made before an opt-in. */
export function Analytics({ measurementId }: { measurementId?: string }) {
  return <Suspense fallback={null}><AnalyticsControls measurementId={measurementId} /></Suspense>;
}

export function AnalyticsPreferencesButton() {
  return (
    <button type="button" className="btn" onClick={() => window.dispatchEvent(new Event(ANALYTICS_PREFERENCES_EVENT))}>
      Alterar preferência de análise
    </button>
  );
}

function AnalyticsControls({ measurementId }: { measurementId?: string }) {
  const pathname = usePathname();
  const id = validMeasurementId(measurementId);
  const previousId = useRef<string | null>(null);
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [preparedId, setPreparedId] = useState<string | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");

  useEffect(() => {
    const saved = readAnalyticsConsent();
    setConsent(saved);
    setPreferencesOpen(saved === null);
    setHydrated(true);

    const openPreferences = () => setPreferencesOpen(true);
    const syncPreference = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_KEY && event.key !== null) return;
      const choice = event.key === null ? null : parseAnalyticsConsent(event.newValue);
      if (choice !== "granted" && id) stopAnalytics(id);
      setConsent(choice);
      setPreferencesOpen(choice === null);
    };
    window.addEventListener(ANALYTICS_PREFERENCES_EVENT, openPreferences);
    window.addEventListener("storage", syncPreference);
    return () => {
      window.removeEventListener(ANALYTICS_PREFERENCES_EVENT, openPreferences);
      window.removeEventListener("storage", syncPreference);
    };
  }, [id]);

  useEffect(() => {
    if (previousId.current && previousId.current !== id) stopAnalytics(previousId.current);
    previousId.current = id;
    if (hydrated && id) {
      // Prepare consent and safe defaults before rendering the external Script.
      const prepared = updateAnalyticsPage(id, pathname ?? "/", consent, document.referrer);
      setPreparedId(prepared ? id : null);
    }
  }, [id, hydrated, consent, pathname]);

  function choose(choice: AnalyticsConsent) {
    // Disable synchronously: a late script load must not flush a queued page view.
    if (choice === "denied" && id) stopAnalytics(id);
    const saved = saveAnalyticsConsent(choice);
    setConsent(choice);
    setStorageNotice(saved ? "" : "O navegador não permitiu salvar a preferência. Sua escolha vale enquanto esta página estiver aberta.");
    setPreferencesOpen(false);
  }

  if (!id || !hydrated) return null;
  const canLoadTag = preparedId === id && consent === "granted" && isAnalyticsHost() && getAnalyticsPage(pathname ?? "/") !== null;

  return (
    <>
      {canLoadTag && (
        <Script
          id={`politica007-analytics-${id}`}
          src={`https://www.googletagmanager.com/gtag/js?id=${id}&l=${ANALYTICS_DATA_LAYER}`}
          strategy="afterInteractive"
          referrerPolicy="no-referrer"
          onReady={() => markAnalyticsReady(id)}
        />
      )}
      <aside className={styles.preferences} aria-label="Preferências de análise">
        {preferencesOpen ? (
          <section className={styles.card} aria-labelledby="analytics-preferences-title">
            <div className={styles.heading}>
              <h2 id="analytics-preferences-title">Cookies de análise</h2>
              {consent !== null && <button type="button" className={styles.close} onClick={() => setPreferencesOpen(false)} aria-label="Fechar preferências de análise">Fechar</button>}
            </div>
            <p>Com sua permissão, usamos o Google Analytics para entender o uso das seções do portal. Esta medição não recebe termos pesquisados, nomes, CPF ou CNPJ.</p>
            <p className={styles.detail}>Você pode mudar de ideia a qualquer momento. <Link href="/privacidade">Como funciona</Link></p>
            <div className={styles.actions}>
              <button type="button" onClick={() => choose("granted")}>Aceitar</button>
              <button type="button" onClick={() => choose("denied")}>{consent === "granted" ? "Retirar consentimento" : "Recusar"}</button>
            </div>
          </section>
        ) : (
          <button type="button" className={styles.reopen} onClick={() => setPreferencesOpen(true)} aria-expanded={false}>
            Cookies de análise
          </button>
        )}
        {storageNotice && <p role="status" className={styles.storageNotice}>{storageNotice}</p>}
      </aside>
    </>
  );
}

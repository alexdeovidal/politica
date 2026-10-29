"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function TrajectoryReportPrintButton({
  candidateName,
  yearRange,
  className,
}: {
  candidateName: string;
  yearRange: string;
  className?: string;
}) {
  useEffect(() => {
    document.body.classList.add("trajectory-report-page");
    return () => document.body.classList.remove("trajectory-report-page");
  }, []);

  function printReport() {
    document.body.classList.add("trajectory-report-page");
    const previousTitle = document.title;
    document.title = `Relatorio de trajetoria eleitoral - ${candidateName} - ${yearRange}`;
    window.addEventListener("afterprint", () => { document.title = previousTitle; }, { once: true });
    window.print();
  }

  return (
    <button className={`${className || ""} trajectory-report__print-button`} type="button" onClick={printReport}>
      <Printer size={16} aria-hidden="true" />
      Salvar como PDF / imprimir
    </button>
  );
}

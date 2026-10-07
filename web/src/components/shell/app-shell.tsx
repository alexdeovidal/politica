"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ContributionReminder } from "@/components/contribution-card";
import { ShellProvider } from "./shell-context";
import { Metrics } from "@/components/platform/metrics";
import { PageTools } from "@/components/platform/page-tools";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  aiReviewEnabled,
  children,
}: {
  aiReviewEnabled: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/apuracao") {
    return <ShellProvider aiReviewEnabled={aiReviewEnabled}><Metrics/>{children}</ShellProvider>;
  }
  return (
    <ShellProvider aiReviewEnabled={aiReviewEnabled}>
      <ContributionReminder />
      <Metrics/>
      <div className="shell-layout">
        <Sidebar />
        <div className="shell-main">
          <Topbar />
          <ContentBody>{pathname?.startsWith("/news")?null:<PageTools />}{children}</ContentBody>
        </div>
      </div>
    </ShellProvider>
  );
}

function ContentBody({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/grafo")) {
    return <div className="graph-page-body flex min-h-0 flex-col" style={{ height: "calc(100vh - var(--navbar-offset))" }}>{children}</div>;
  }
  return <div className="content__inner">{children}</div>;
}

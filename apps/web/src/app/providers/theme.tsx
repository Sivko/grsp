import { ConfigProvider, theme as antdTheme } from "antd";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: { colorPrimary: "#1677ff", borderRadius: 6 },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

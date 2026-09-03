"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Dark mode is out of scope for v1 (none of the 4 approved mockups render
// it — see the plan's "Open items"), but the tokens already exist in
// globals.css, so we wire next-themes' class strategy now and force the
// "light" theme so flipping this on later is a one-line change
// (defaultTheme="system" + enableSystem).
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

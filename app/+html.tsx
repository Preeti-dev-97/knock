import {
  ScrollViewStyleReset,
  useServerDocumentContext,
} from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } =
    useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />

        <ScrollViewStyleReset />

        <style>{`
          html,
          body {
            margin: 0;
            padding: 0;
            min-height: 100%;
            background-color: #0D0B16;
          }

          body {
            overflow-x: hidden;
          }

          #root {
            min-height: 100vh;
          }
        `}</style>

        {/* Required: Expo-generated styles and metadata */}
        {headNodes}
      </head>

      <body {...bodyAttributes}>
        {children}

        {/* Required: Expo-generated fonts and JavaScript bundles */}
        {bodyNodes}
      </body>
    </html>
  );
}

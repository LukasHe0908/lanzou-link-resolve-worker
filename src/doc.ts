import { marked } from 'marked';
import apiMD from '../docs/API.txt';

export function returnHtml() {
	const html = marked.parse(apiMD);
	return new Response(
		`<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>API 文档</title>
    <style>
      html {
        margin: 1em;
      }
      body {
        font-family: sans-serif;
        max-width: max(60vw, 720px);
        margin: 0 auto;
        line-height: 1.6;
      }
      pre {
        background: #f4f4f4;
        padding: 1em;
        overflow-x: auto;
      }
      code {
        font-family: monospace;
      }
    </style>
  </head>
  <body>${html}</body>
</html>
`,
		{
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		}
	);
}

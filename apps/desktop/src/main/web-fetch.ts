// Electron's network stack resolves the hostname again. Research instead connects
// with core's validated DNS binding while preserving the original Host/TLS name.
export { fetchPublicPage as fetchWebPage } from "../../../../packages/core-runtime/src/web-tools";

// Vite ?url asset import declarations.
// pdfjs-dist worker is loaded as a static asset URL via ?url.

declare module '*?url' {
  const url: string
  export default url
}

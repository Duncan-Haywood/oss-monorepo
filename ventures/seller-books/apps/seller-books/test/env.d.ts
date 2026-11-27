// Fixture files imported as text in worker tests (Vite `?raw`).
declare module "*.csv?raw" {
  const text: string;
  export default text;
}

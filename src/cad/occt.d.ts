declare module 'occt-import-js' {
  const factory: (options?: {
    wasmBinary?: ArrayBuffer;
    locateFile?: (f: string) => string;
  }) => Promise<import('./import').Occt>;
  export default factory;
}

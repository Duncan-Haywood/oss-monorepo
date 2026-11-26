// The one runtime global this package uses beyond ES2023. Present in Workers, browsers and Node;
// declared here so the package needs neither the DOM lib nor @types/node.
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array): string;
}

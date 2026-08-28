declare module "jsdom" {
  export interface ConstructorOptions {
    url?: string;
    runScripts?: "dangerously" | "outside-only";
  }

  export class JSDOM {
    constructor(html?: string | Buffer, options?: ConstructorOptions);
    readonly window: Window & typeof globalThis;
  }
}

/**
 * What the real `CrashEngine` needs to run headless in node: its canvas, WebGL context, 2d contexts, `window` and `document` are
 * inert stand-ins (every call answers, nothing draws); the sim, the scene and the loop rules are the engine's own. `getParameter`
 * answers a string that also reads as the number 16, so three's version check and its numeric limits both take it.
 */
const ctx2d: object = new Proxy(function () {}, { get: () => () => ctx2d, apply: () => ctx2d });
const GL_ANSWERS: Record<string, () => unknown> = {
  getParameter: () => Object.assign(new String("WebGL 2.0"), { valueOf: () => 16 }),
  getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
  getContextAttributes: () => ({ alpha: false, antialias: false }),
  getSupportedExtensions: () => [],
  getExtension: () => null,
  getShaderInfoLog: () => "",
  getProgramInfoLog: () => "",
  getProgramParameter: () => 0,
};
const GL_CONSTANTS = new Map<string, number>();
const gl: object = new Proxy(function () {}, {
  get: (_t, k) => {
    if (typeof k !== "string") return undefined;
    // Upper-case names are GL constants: each its own number (three compares them to pick a draw mode, a format).
    if (k === k.toUpperCase()) return GL_CONSTANTS.get(k) ?? (GL_CONSTANTS.set(k, GL_CONSTANTS.size + 1), GL_CONSTANTS.size);
    return GL_ANSWERS[k] ?? (k.startsWith("create") ? () => ({}) : () => 1);
  },
  apply: () => 1,
});
export const element = (): HTMLCanvasElement & HTMLElement =>
  ({
    style: {},
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 600,
    getContext: (kind: string) => (kind === "2d" ? ctx2d : gl),
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    appendChild() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    parentElement: null,
  }) as unknown as HTMLCanvasElement & HTMLElement;

export function stubBrowser(): void {
  Object.assign(globalThis, {
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { search: "", hash: "", href: "http://x/", origin: "http://x" },
    history: { state: null, replaceState() {} },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { createElement: element, addEventListener() {}, removeEventListener() {}, body: element(), documentElement: element() },
  });
  (globalThis as { window?: unknown }).window = globalThis;
}

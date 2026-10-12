/** What `three/addons/libs/stats.module.js` exports (`@types/three` types it as `stats.js`, which is not installed). */
declare module "stats.js" {
  class Stats {
    dom: HTMLDivElement;
    showPanel(id: number): void;
    begin(): void;
    end(): void;
  }
  export = Stats;
}

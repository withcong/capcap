export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let root: HTMLDivElement | null = null;
    let app: unknown | null = null;
    let cleanup: (() => void) | null = null;

    const mountOverlay = async () => {
      if (root || app) return;

      const [{ mount, unmount }, { default: CapCapOverlay }] = await Promise.all([
        import('svelte'),
        import('./content/CapCapOverlay.svelte'),
      ]);

      root = document.createElement('div');
      root.id = 'capcap-root';
      document.documentElement.appendChild(root);

      cleanup = () => {
        if (app) unmount(app as never);
        app = null;
        root?.remove();
        root = null;
        cleanup = null;
      };

      app = mount(CapCapOverlay, {
        target: root,
        props: {
          onExit: () => cleanup?.(),
        },
      });
    };

    const toggle = () => {
      if (root || app) return cleanup?.();
      void mountOverlay();
    };

    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'CAPCAP_TOGGLE') toggle();
    });
  },
});

import { mount, unmount } from 'svelte';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    let app: unknown | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'capcap-ui',
      position: 'overlay',
      onMount: (container, shadow, shadowHost) => {
        shadowHost.id = 'capcap-root';

        return import('./CapCapOverlay.svelte').then(({ default: CapCapOverlay }) => {
          app = mount(CapCapOverlay, {
            target: container,
            props: {
              onExit: () => ui.remove(),
            },
          });
          return app;
        });
      },
      onRemove: (mountedApp) => {
        if (mountedApp) unmount(mountedApp as never);
        app = null;
      },
    });

    const toggle = () => {
      if (app) {
        ui.remove();
      } else {
        ui.mount();
      }
    };

    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'CAPCAP_TOGGLE') toggle();
    });
  },
});

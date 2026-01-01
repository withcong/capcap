export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    await browser.tabs.sendMessage(tab.id, { type: 'CAPCAP_TOGGLE' });
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'capcap-capture') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    await browser.tabs.sendMessage(tab.id, { type: 'CAPCAP_TOGGLE' });
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'CAPTURE_SCREENSHOT' && sender.tab?.id) {
      browser.tabs.captureVisibleTab(
        sender.tab.windowId,
        { format: 'png' }
      ).then((dataUrl) => {
        sendResponse({ dataUrl });
      }).catch((error) => {
        sendResponse({ error: error.message });
      });
      return true;
    }
  });
});

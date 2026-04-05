// service-worker.js — configures side panel behavior and keyboard command
chrome.runtime.onInstalled.addListener(() => {
  // Set the default side panel HTML path inside the extension
  chrome.sidePanel.setOptions({ path: 'dist/index.html' }).catch((e) => console.warn('sidePanel.setOptions failed', e))

  // Allow users to open the side panel by clicking the toolbar icon
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.warn('setPanelBehavior failed', e))
})

// Optional: log when the side panel opens/closes (useful for debugging)
chrome.sidePanel.onOpened && chrome.sidePanel.onOpened.addListener((info) => {
  console.log('side panel opened', info)
})
chrome.sidePanel.onClosed && chrome.sidePanel.onClosed.addListener((info) => {
  console.log('side panel closed', info)
})

// The reserved command `_execute_side_panel` will toggle the panel in modern Chrome.
// We still listen to commands to optionally open programmatically in older Chrome.
chrome.commands && chrome.commands.onCommand.addListener(async (command) => {
  console.log('command received', command)
  try {
    if (command === '_execute_side_panel') {
      // Attempt to open the panel for the current window — Chrome will handle toggle behavior.
      const w = await chrome.windows.getCurrent()
      await chrome.sidePanel.open({ windowId: w.id })
    }
  } catch (e) {
    console.warn('sidePanel open failed', e)
  }
})

import { render } from 'preact';
import { App } from './app';
import { IS_DEMO, loadDemo } from './demo';
import { init } from './store';
import './styles.css';

if (!IS_DEMO) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  // Safari kann Daten von nicht installierten Websites löschen – persistenten Speicher anfordern.
  void navigator.storage?.persist?.();
}
void init().then(() => { if (IS_DEMO) void loadDemo(); });
render(<App />, document.getElementById('app')!);

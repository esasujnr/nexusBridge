import { fn_loadConfig } from './js/js_siteConfig.js';

const CONST_FAVICON_HREF = '/images/de/nexus_bridge_favicon.svg?v=3';

function fn_forceFavicon() {
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;

  const oldLinks = head.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']");
  oldLinks.forEach((node) => node.parentNode && node.parentNode.removeChild(node));

  const icon = document.createElement('link');
  icon.setAttribute('rel', 'icon');
  icon.setAttribute('type', 'image/svg+xml');
  icon.setAttribute('href', CONST_FAVICON_HREF);
  head.appendChild(icon);

  const shortcut = document.createElement('link');
  shortcut.setAttribute('rel', 'shortcut icon');
  shortcut.setAttribute('type', 'image/svg+xml');
  shortcut.setAttribute('href', CONST_FAVICON_HREF);
  head.appendChild(shortcut);
}


async function fn_startApp() {

  // Force favicon at runtime to avoid stale browser fallback on /favicon.ico.
  fn_forceFavicon();
  setTimeout(fn_forceFavicon, 300);
  setTimeout(fn_forceFavicon, 1500);

  await fn_loadConfig();

  const React = (await import('react')).default;
  const ReactDOM = await import('react-dom/client');
  const { BrowserRouter, Routes, Route } = await import('react-router-dom');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('./js/i18n')).default;

  const Layout = (await import('./pages/Layout')).default;
  const Home = (await import('./pages/home')).default;
  const NoPage = (await import('./pages/NoPage')).default;
  const GamePadTesterPage = (await import('./pages/gamepadTester')).default;
  const DebugPage = (await import('./pages/debug')).default;


  function App2() {

    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="index.html" element={<Home />} />
            <Route path="index" element={<Home />} />
            <Route path="home" element={<Home />} />
            <Route path="webclient" element={<Home />} />
            <Route path="gamepad" element={<GamePadTesterPage />} />
            <Route path="debug" element={<DebugPage />} />
            <Route path="*" element={<NoPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    );
  }


  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <I18nextProvider i18n={i18n}>
      <App2 />
    </I18nextProvider>
  );
}


fn_startApp();

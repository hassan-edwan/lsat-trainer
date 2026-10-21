import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store.jsx';
import Home from './pages/Home.jsx';
import ImportPage from './pages/ImportPage.jsx';
import TestDetail from './pages/TestDetail.jsx';
import SessionPage from './pages/SessionPage.jsx';
import DrillBuilder from './pages/DrillBuilder.jsx';
import Journal from './pages/Journal.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import Diagnostic from './pages/Diagnostic.jsx';
import Today from './pages/Today.jsx';
import Stamina from './pages/Stamina.jsx';
import Layout from './components/Layout.jsx';

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function Shell() {
  const route = useHashRoute();
  const { loaded } = useStore();
  const [, section, id] = route.split('/');

  // The test interface takes over the whole screen, like test day.
  if (section === 'session' && id) {
    return loaded ? <SessionPage key={id} id={id} /> : <div className="loading">Loading…</div>;
  }
  if (!loaded) return <div className="loading">Loading…</div>;

  let page;
  if (section === 'import') page = <ImportPage />;
  else if (section === 'test' && id) page = <TestDetail id={decodeURIComponent(id)} />;
  else if (section === 'drill') page = <DrillBuilder />;
  else if (section === 'diagnostic') page = <Diagnostic />;
  else if (section === 'stamina') page = <Stamina />;
  else if (section === 'journal') page = <Journal />;
  else if (section === 'stats') page = <Stats />;
  else if (section === 'settings') page = <Settings />;
  else if (section === 'library') page = <Home />;
  else page = <Today />;

  return <Layout section={section}>{page}</Layout>;
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { Projects } from './pages/Projects';
import { CodeRules } from './pages/CodeRules';
import { CodeTester } from './pages/CodeTester';
import { Stats } from './pages/Stats';
import { getToken } from './lib/api';

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/code-rules" element={<CodeRules />} />
          <Route path="/tester" element={<CodeTester />} />
          <Route path="/stats" element={<Stats />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useSession } from "./api/hooks";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectSettingsPage } from "./pages/ProjectSettingsPage";
import { ProjectsPage } from "./pages/ProjectsPage";

function RequireAuth() {
  const session = useSession();
  if (session.isPending) return <p className="p-6 text-fg-muted">Loading…</p>;
  if (session.isError) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

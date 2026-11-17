import { Link, Outlet, useNavigate } from "react-router-dom";
import { useLogout, useSession } from "../api/hooks";

/** Page chrome for signed-in routes: app name, current user and sign-out. */
export function Shell() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b bg-surface px-6 py-3">
        <Link to="/" className="font-semibold">
          Project Tracker
        </Link>
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span>{session.data?.user.email}</span>
          <button
            type="button"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
            className="rounded border border-line px-2 py-1 hover:bg-surface-hover"
          >
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

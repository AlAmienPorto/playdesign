import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import Overview from "./pages/Overview";
import Inbox from "./pages/Inbox";
import Briefs from "./pages/Briefs";
import Leads from "./pages/Leads";
import Clients from "./pages/Clients";
import Projects from "./pages/Projects";
import Studio from "./pages/Studio";
import Finance from "./pages/Finance";
import Knowledge from "./pages/Knowledge";
import Analytics from "./pages/Analytics";
import Automation from "./pages/Automation";
import Kanban from "./pages/Kanban";
import Tasks from "./pages/Tasks";
import Schedule from "./pages/Schedule";
import Agent from "./pages/Agent";
import Delivery from "./pages/Delivery";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="briefs" element={<Briefs />} />
        <Route path="leads" element={<Leads />} />
        <Route path="clients" element={<Clients />} />
        <Route path="projects" element={<Projects />} />
        <Route path="studio" element={<Studio />} />
        <Route path="finance" element={<Finance />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="automation" element={<Automation />} />
        <Route path="kanban" element={<Kanban />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="agent" element={<Agent />} />
        <Route path="delivery" element={<Delivery />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
